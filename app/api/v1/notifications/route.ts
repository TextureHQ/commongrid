/**
 * GET /api/v1/notifications — List notifications for current user
 *
 * Requires auth. Supports cursor-based pagination, filtering by type
 * and unread_only.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import { and, desc, eq, isNull, lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Valid notification types
// ---------------------------------------------------------------------------

const VALID_TYPES = [
  "contribution_approved",
  "contribution_returned",
  "changes_requested",
  "entity_updated",
  "discussion_reply",
  "appeal_resolved",
  "trusted_status_earned",
  "entity_followed_update",
] as const;

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();
  const url = new URL(req.url);

  const type = url.searchParams.get("type");
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  const conditions = [eq(notifications.userId, user.id)];

  if (type) {
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `type must be one of: ${VALID_TYPES.join(", ")}`, { field: "type" });
    }
    conditions.push(eq(notifications.type, type));
  }

  if (unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.id, cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(lt(notifications.createdAt, cursorRow.createdAt));
    }
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
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
// Route handler
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}
