/**
 * GET /api/v1/mod/contributions — Moderation Review Queue
 *
 * Lists pending/flagged contributions with filters for the moderation UI.
 * Requires moderator or admin role.
 *
 * Query parameters:
 *   status       — 'pending' | 'changes_requested' | 'auto_approved' | 'returned' | 'approved'
 *   entity_type  — filter by entity type
 *   auto_flagged — 'true' | 'false'
 *   entity_state — filter by state code (geographic)
 *   cursor       — cursor for pagination (contribution ID)
 *   limit        — page size (default 20, max 100)
 *
 * Response includes contributor info (display_name, contribution_count, role).
 *
 * See docs/specs/community-contributions-api-erd.md §3.4
 */

import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { contributions, users } from "@/lib/db/schema";
import { requireModerator } from "@/lib/mod/require-moderator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_QUEUE_STATUSES = ["pending", "changes_requested", "auto_approved", "returned", "approved"] as const;

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
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  await requireModerator();

  const url = new URL(req.url);
  const db = getDb();

  // Parse filters
  const status = url.searchParams.get("status");
  const entityType = url.searchParams.get("entity_type");
  const autoFlagged = url.searchParams.get("auto_flagged");
  const entityState = url.searchParams.get("entity_state");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

  // Build conditions
  const conditions = [];

  if (status) {
    if (!VALID_QUEUE_STATUSES.includes(status as (typeof VALID_QUEUE_STATUSES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `status must be one of: ${VALID_QUEUE_STATUSES.join(", ")}`, {
        field: "status",
      });
    }
    conditions.push(eq(contributions.status, status));
  }

  if (entityType) {
    if (!VALID_ENTITY_TYPES.includes(entityType as (typeof VALID_ENTITY_TYPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
        field: "entity_type",
      });
    }
    conditions.push(eq(contributions.entityType, entityType));
  }

  if (autoFlagged !== null && autoFlagged !== undefined) {
    if (autoFlagged !== "true" && autoFlagged !== "false") {
      throw new ApiError("VALIDATION_ERROR", "auto_flagged must be 'true' or 'false'.", { field: "auto_flagged" });
    }
    conditions.push(eq(contributions.autoFlagged, autoFlagged === "true"));
  }

  if (entityState) {
    conditions.push(eq(contributions.entityState, entityState));
  }

  // Cursor-based pagination: use createdAt of the cursor contribution
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: contributions.createdAt })
      .from(contributions)
      .where(eq(contributions.id, cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(lt(contributions.createdAt, cursorRow.createdAt));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count query (without cursor for total)
  const countConditions = conditions.filter((_, i) => {
    // Remove the cursor condition (last one if cursor was provided)
    if (cursor) {
      return i < conditions.length - 1;
    }
    return true;
  });
  const countWhere = countConditions.length > 0 ? and(...countConditions) : undefined;

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(contributions);
  if (countWhere) {
    countQuery = countQuery.where(countWhere) as typeof countQuery;
  }
  const [{ count }] = await countQuery;

  // Data query with LEFT JOIN on users for contributor info
  const rows = await db
    .select({
      contribution: contributions,
      contributor: {
        displayName: users.displayName,
        contributionCount: users.contributionCount,
        role: users.role,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(contributions)
    .leftJoin(users, eq(contributions.userId, users.id))
    .where(whereClause)
    .orderBy(desc(contributions.createdAt))
    .limit(limit + 1); // Fetch one extra to detect hasMore

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].contribution.id : null;

  // Shape the response
  const data = pageRows.map((row) => ({
    ...row.contribution,
    contributor: row.contributor
      ? {
          display_name: row.contributor.displayName,
          contribution_count: row.contributor.contributionCount,
          role: row.contributor.role,
          avatar_url: row.contributor.avatarUrl,
        }
      : null,
  }));

  return jsonResponse(
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
// Route handler
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}
