/**
 * GET  /api/v1/follows — List current user's follows
 * POST /api/v1/follows — Follow an entity
 *
 * Both endpoints require authentication.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Entity Follows
 */

import { and, desc, eq, lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { entityFollows } from "@/lib/db/schema";

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

// ---------------------------------------------------------------------------
// GET /api/v1/follows — List current user's follows
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();
  const url = new URL(req.url);

  const entityType = url.searchParams.get("entity_type");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const conditions = [eq(entityFollows.userId, user.id)];

  if (entityType) {
    if (!VALID_ENTITY_TYPES.includes(entityType as (typeof VALID_ENTITY_TYPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
        field: "entity_type",
      });
    }
    conditions.push(eq(entityFollows.entityType, entityType));
  }

  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: entityFollows.createdAt })
      .from(entityFollows)
      .where(eq(entityFollows.id, cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(lt(entityFollows.createdAt, cursorRow.createdAt));
    }
  }

  const rows = await db
    .select()
    .from(entityFollows)
    .where(and(...conditions))
    .orderBy(desc(entityFollows.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;

  return jsonResponse(
    {
      data: pageRows,
      pagination: {
        cursor: nextCursor,
        limit,
        hasMore,
      },
    },
    200,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// POST /api/v1/follows — Follow an entity (upsert)
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const body = await req.json();
  const { entity_type, entity_id, notify_all_changes, notify_discussions } = body;

  // Validation
  if (!entity_type || !VALID_ENTITY_TYPES.includes(entity_type)) {
    throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
      field: "entity_type",
    });
  }

  if (!entity_id || typeof entity_id !== "string") {
    throw new ApiError("VALIDATION_ERROR", "entity_id is required and must be a string.", { field: "entity_id" });
  }

  const db = getDb();

  // Upsert: insert or update on conflict (unique: userId + entityType + entityId)
  const [follow] = await db
    .insert(entityFollows)
    .values({
      userId: user.id,
      entityType: entity_type,
      entityId: entity_id,
      notifyAllChanges: notify_all_changes ?? true,
      notifyDiscussions: notify_discussions ?? true,
    })
    .onConflictDoUpdate({
      target: [entityFollows.userId, entityFollows.entityType, entityFollows.entityId],
      set: {
        notifyAllChanges: notify_all_changes ?? true,
        notifyDiscussions: notify_discussions ?? true,
      },
    })
    .returning();

  return jsonResponse({ data: follow }, 201, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
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
