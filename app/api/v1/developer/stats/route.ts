/**
 * GET /api/v1/developer/stats — Developer dashboard overview
 *
 * Returns aggregate stats for the authenticated user's API keys:
 * - Total requests (current 30-day period)
 * - Average daily requests
 * - Most-used endpoint
 * - P95 response time
 * - Active key count
 *
 * Requires Clerk authentication.
 *
 * See LDR-65: Developer registration flow + dashboard UI
 */

import { and, avg, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { apiKeys, apiUsageEvents } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/developer/stats
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get user's key stats
  const userKeys = await db
    .select({
      id: apiKeys.id,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id));

  const allKeyIds = userKeys.map((k) => k.id);
  const activeKeyCount = userKeys.filter((k) => k.isActive).length;

  // If user has no keys, return empty dashboard
  if (allKeyIds.length === 0) {
    return jsonResponse(
      {
        data: {
          period: "30d",
          totalRequests: 0,
          avgDailyRequests: 0,
          mostUsedEndpoint: null,
          p95ResponseTimeMs: 0,
          avgResponseTimeMs: 0,
          activeKeyCount: 0,
          totalKeyCount: 0,
        },
      },
      200,
      { ...corsHeaders(), "X-Request-Id": ctx.requestId }
    );
  }

  // biome-ignore lint/style/noNonNullAssertion: and() always returns defined when given 2+ args
  const baseConditions = and(
    inArray(apiUsageEvents.apiKeyId, allKeyIds),
    gte(apiUsageEvents.createdAt, thirtyDaysAgo)
  )!;

  // Total requests + avg response time
  const [totals] = await db
    .select({
      totalRequests: count(),
      avgResponseTimeMs: avg(apiUsageEvents.responseTimeMs),
    })
    .from(apiUsageEvents)
    .where(baseConditions);

  const totalRequests = totals?.totalRequests ?? 0;
  const avgResponseTimeMs = totals?.avgResponseTimeMs ? Math.round(Number(totals.avgResponseTimeMs)) : 0;

  // Average daily requests (over 30 days)
  const avgDailyRequests = Math.round(totalRequests / 30);

  // Most-used endpoint
  const [topEndpoint] = await db
    .select({
      endpoint: apiUsageEvents.endpoint,
      count: count(),
    })
    .from(apiUsageEvents)
    .where(baseConditions)
    .groupBy(apiUsageEvents.endpoint)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  // P95 response time using percentile_cont
  const [p95Result] = await db
    .select({
      p95: sql<number>`COALESCE(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${apiUsageEvents.responseTimeMs}),
        0
      )`.as("p95"),
    })
    .from(apiUsageEvents)
    .where(baseConditions);

  return jsonResponse(
    {
      data: {
        period: "30d",
        totalRequests,
        avgDailyRequests,
        mostUsedEndpoint: topEndpoint ? { endpoint: topEndpoint.endpoint, count: topEndpoint.count } : null,
        p95ResponseTimeMs: Math.round(Number(p95Result?.p95 ?? 0)),
        avgResponseTimeMs,
        activeKeyCount,
        totalKeyCount: allKeyIds.length,
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
