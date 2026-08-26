/**
 * GET   /api/v1/discussions/:id — Thread detail with posts
 * PATCH /api/v1/discussions/:id — Close/reopen thread (mod/admin only)
 *
 * See docs/specs/community-contributions-api-erd.md §6 Discussions
 */

import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { cachedJsonResponse, jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { discussionPosts, discussionThreads, users } from "@/lib/db/schema";
import { requireModerator } from "@/lib/mod/require-moderator";

// ---------------------------------------------------------------------------
// GET /api/v1/discussions/:id — Thread detail with posts
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const threadId = ctx.params?.id;
  if (!threadId) {
    throw new ApiError("BAD_REQUEST", "Thread ID is required.");
  }

  const db = getDb();
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  // Fetch thread with author info
  const [threadRow] = await db
    .select({
      thread: discussionThreads,
      author: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(discussionThreads)
    .leftJoin(users, eq(discussionThreads.createdBy, users.id))
    .where(eq(discussionThreads.id, threadId))
    .limit(1);

  if (!threadRow) {
    throw new ApiError("NOT_FOUND", `Discussion thread ${threadId} not found.`);
  }

  // Fetch posts with author info, cursor-paginated
  const postConditions = [eq(discussionPosts.threadId, threadId)];

  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: discussionPosts.createdAt })
      .from(discussionPosts)
      .where(eq(discussionPosts.id, cursor))
      .limit(1);

    if (cursorRow) {
      postConditions.push(lt(discussionPosts.createdAt, cursorRow.createdAt));
    }
  }

  // Count non-deleted posts for total
  const [{ count: postTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(discussionPosts)
    .where(and(eq(discussionPosts.threadId, threadId), isNull(discussionPosts.deletedAt)));

  const postRows = await db
    .select({
      post: discussionPosts,
      author: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(discussionPosts)
    .leftJoin(users, eq(discussionPosts.userId, users.id))
    .where(and(...postConditions))
    .orderBy(asc(discussionPosts.createdAt))
    .limit(limit + 1);

  const hasMorePosts = postRows.length > limit;
  const pagePostRows = hasMorePosts ? postRows.slice(0, limit) : postRows;
  const nextCursor = hasMorePosts && pagePostRows.length > 0 ? pagePostRows[pagePostRows.length - 1].post.id : null;

  const posts = pagePostRows.map((row) => ({
    ...row.post,
    // Redact body for soft-deleted posts
    body: row.post.deletedAt ? "[deleted]" : row.post.body,
    author: row.author
      ? {
          display_name: row.author.displayName,
          avatar_url: row.author.avatarUrl,
        }
      : null,
  }));

  return cachedJsonResponse(
    {
      data: {
        ...threadRow.thread,
        author: threadRow.author
          ? {
              display_name: threadRow.author.displayName,
              avatar_url: threadRow.author.avatarUrl,
            }
          : null,
        posts: {
          data: posts,
          pagination: {
            cursor: nextCursor,
            limit,
            total: Number(postTotal),
            hasMore: hasMorePosts,
          },
        },
      },
    },
    200,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/discussions/:id — Close/reopen thread
// ---------------------------------------------------------------------------

async function handlePatch(req: Request, ctx: RouteContext) {
  const threadId = ctx.params?.id;
  if (!threadId) {
    throw new ApiError("BAD_REQUEST", "Thread ID is required.");
  }

  const moderator = await requireModerator();
  const body = await req.json();
  const { status } = body;

  if (!status || (status !== "open" && status !== "closed")) {
    throw new ApiError("VALIDATION_ERROR", "status must be 'open' or 'closed'.", { field: "status" });
  }

  const db = getDb();

  // Check thread exists
  const [existing] = await db.select().from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1);

  if (!existing) {
    throw new ApiError("NOT_FOUND", `Discussion thread ${threadId} not found.`);
  }

  if (existing.status === status) {
    throw new ApiError("CONFLICT", `Thread is already ${status}.`);
  }

  const now = new Date();
  const updates: Record<string, unknown> = { status };

  if (status === "closed") {
    updates.closedBy = moderator.id;
    updates.closedAt = now;
  } else {
    // Reopening
    updates.closedBy = null;
    updates.closedAt = null;
  }

  const [updated] = await db
    .update(discussionThreads)
    .set(updates)
    .where(eq(discussionThreads.id, threadId))
    .returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getHandler(req, { requestId: generateRequestId(), params: { id } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchHandler(req, { requestId: generateRequestId(), params: { id } });
}
