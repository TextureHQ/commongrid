/**
 * GET /api/v1/mod/stats — Moderation Dashboard Statistics
 *
 * Returns aggregate stats for the moderation dashboard:
 *   - Total pending contributions
 *   - Total flagged contributions
 *   - Contributions reviewed today / this week
 *   - Average review time (from created_at to reviewed_at)
 *
 * Requires moderator or admin role.
 */

import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { contributions } from "@/lib/db/schema";
import { requireModerator } from "@/lib/mod/require-moderator";

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  await requireModerator();

  const db = getDb();
  const now = new Date();

  // Start of today (UTC)
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Start of this week (Monday UTC)
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday));

  // Run all stats queries in parallel
  const [pendingResult, flaggedResult, reviewedTodayResult, reviewedWeekResult, avgReviewTimeResult] =
    await Promise.all([
      // Total pending contributions
      db.select({ count: sql<number>`count(*)` }).from(contributions).where(eq(contributions.status, "pending")),

      // Total flagged contributions (pending + flagged)
      db
        .select({ count: sql<number>`count(*)` })
        .from(contributions)
        .where(and(eq(contributions.autoFlagged, true), eq(contributions.status, "pending"))),

      // Contributions reviewed today
      db
        .select({ count: sql<number>`count(*)` })
        .from(contributions)
        .where(and(isNotNull(contributions.reviewedAt), gte(contributions.reviewedAt, todayStart))),

      // Contributions reviewed this week
      db
        .select({ count: sql<number>`count(*)` })
        .from(contributions)
        .where(and(isNotNull(contributions.reviewedAt), gte(contributions.reviewedAt, weekStart))),

      // Average review time (only for reviewed contributions)
      db
        .select({
          avgMs: sql<number>`
          COALESCE(
            AVG(
              EXTRACT(EPOCH FROM (${contributions.reviewedAt} - ${contributions.createdAt})) * 1000
            ),
            0
          )
        `,
        })
        .from(contributions)
        .where(isNotNull(contributions.reviewedAt)),
    ]);

  const avgReviewMs = Number(avgReviewTimeResult[0]?.avgMs ?? 0);
  const avgReviewHours = avgReviewMs > 0 ? Math.round((avgReviewMs / (1000 * 60 * 60)) * 100) / 100 : 0;

  return jsonResponse(
    {
      data: {
        pending_count: Number(pendingResult[0].count),
        flagged_count: Number(flaggedResult[0].count),
        reviewed_today: Number(reviewedTodayResult[0].count),
        reviewed_this_week: Number(reviewedWeekResult[0].count),
        average_review_time_ms: Math.round(avgReviewMs),
        average_review_time_hours: avgReviewHours,
        generated_at: now.toISOString(),
      },
    },
    200,
    {
      ...corsHeaders(),
      "X-Request-Id": ctx.requestId,
      // Stats should not be cached for long
      "Cache-Control": "private, max-age=30",
    }
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}
