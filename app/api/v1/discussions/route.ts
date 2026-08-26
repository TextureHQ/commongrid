/**
 * GET  /api/v1/discussions — List discussion threads
 * POST /api/v1/discussions — Create a new thread (requires auth)
 *
 * Threads are attached to entities via polymorphic (entity_type, entity_id).
 * GET supports filtering by entity_type, entity_id, and status.
 * Uses cursor-based pagination.
 *
 * See docs/specs/community-contributions-api-erd.md §6 Discussions
 */

import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { cachedJsonResponse, jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { discussionPosts, discussionThreads, users } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ENTITY_TYPES = [
  "utility",
  "power_plant",
  "ev_station",
  "territory",
  "transmission_line",
  "pricing_node",
  "iso",
  "rto",
  "balancing_authority",
  "region",
  "program",
] as const;

const VALID_STATUSES = ["open", "closed"] as const;

// ---------------------------------------------------------------------------
// GET /api/v1/discussions — List threads
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const url = new URL(req.url);
  const db = getDb();

  // Parse filters
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const status = url.searchParams.get("status");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  // Build conditions
  const conditions = [];

  if (entityType) {
    if (!VALID_ENTITY_TYPES.includes(entityType as (typeof VALID_ENTITY_TYPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
        field: "entity_type",
      });
    }
    conditions.push(eq(discussionThreads.entityType, entityType));
  }

  if (entityId) {
    conditions.push(eq(discussionThreads.entityId, entityId));
  }

  if (status) {
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `status must be one of: ${VALID_STATUSES.join(", ")}`, {
        field: "status",
      });
    }
    conditions.push(eq(discussionThreads.status, status));
  }

  // Cursor-based pagination
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: discussionThreads.createdAt })
      .from(discussionThreads)
      .where(eq(discussionThreads.id, cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(lt(discussionThreads.createdAt, cursorRow.createdAt));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count query (without cursor for total)
  const countConditions = cursor ? conditions.slice(0, -1) : conditions;
  const countWhere = countConditions.length > 0 ? and(...countConditions) : undefined;

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(discussionThreads);
  if (countWhere) {
    countQuery = countQuery.where(countWhere) as typeof countQuery;
  }
  const [{ count }] = await countQuery;

  // Data query with author info
  const baseQuery = db
    .select({
      thread: discussionThreads,
      author: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(discussionThreads)
    .leftJoin(users, eq(discussionThreads.createdBy, users.id))
    .orderBy(desc(discussionThreads.createdAt))
    .limit(limit + 1);

  const rows = whereClause ? await baseQuery.where(whereClause) : await baseQuery;

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].thread.id : null;

  // Fetch first post preview for each thread
  const threadIds = pageRows.map((r) => r.thread.id);
  let firstPosts: Record<string, string> = {};

  if (threadIds.length > 0) {
    const posts = await db
      .select({
        threadId: discussionPosts.threadId,
        body: discussionPosts.body,
      })
      .from(discussionPosts)
      .where(and(sql`${discussionPosts.threadId} IN ${threadIds}`, sql`${discussionPosts.deletedAt} IS NULL`))
      .orderBy(discussionPosts.createdAt);

    // Keep only the first post per thread
    firstPosts = {};
    for (const p of posts) {
      if (!firstPosts[p.threadId]) {
        firstPosts[p.threadId] = p.body.length > 200 ? `${p.body.slice(0, 200)}…` : p.body;
      }
    }
  }

  const data = pageRows.map((row) => ({
    ...row.thread,
    first_post_preview: firstPosts[row.thread.id] ?? null,
    author: row.author
      ? {
          display_name: row.author.displayName,
          avatar_url: row.author.avatarUrl,
        }
      : null,
  }));

  return cachedJsonResponse(
    {
      data,
      pagination: {
        cursor: nextCursor,
        limit,
        total: Number(count),
        hasMore,
      },
    },
    200,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// POST /api/v1/discussions — Create a thread + first post
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();

  // Check ban
  if (user.bannedAt) {
    const now = new Date();
    if (!user.bannedUntil || user.bannedUntil > now) {
      throw new ApiError("FORBIDDEN", "Your account is currently suspended.");
    }
  }

  const body = await req.json();
  const { entity_type, entity_id, title, body: threadBody } = body;

  // Validation
  if (!entity_type || !VALID_ENTITY_TYPES.includes(entity_type)) {
    throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
      field: "entity_type",
    });
  }

  if (!entity_id || typeof entity_id !== "string") {
    throw new ApiError("VALIDATION_ERROR", "entity_id is required and must be a string.", { field: "entity_id" });
  }

  if (!title || typeof title !== "string" || title.trim().length < 5) {
    throw new ApiError("VALIDATION_ERROR", "title is required and must be at least 5 characters.", { field: "title" });
  }

  if (!threadBody || typeof threadBody !== "string" || threadBody.trim().length < 10) {
    throw new ApiError("VALIDATION_ERROR", "body is required and must be at least 10 characters.", { field: "body" });
  }

  const db = getDb();
  const now = new Date();

  // Create thread
  const [thread] = await db
    .insert(discussionThreads)
    .values({
      entityType: entity_type,
      entityId: entity_id,
      title: title.trim(),
      status: "open",
      createdBy: user.id,
      postCount: 1,
      lastPostAt: now,
    })
    .returning();

  // Create first post
  const [post] = await db
    .insert(discussionPosts)
    .values({
      threadId: thread.id,
      userId: user.id,
      body: threadBody.trim(),
    })
    .returning();

  return jsonResponse(
    {
      data: {
        ...thread,
        first_post: post,
        author: {
          display_name: user.displayName,
          avatar_url: user.avatarUrl,
        },
      },
    },
    201,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
