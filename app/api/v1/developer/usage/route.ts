/**
 * GET /api/v1/developer/usage — Usage stats for the authenticated user's API keys
 *
 * Query params:
 *   - period: "7d" | "30d" | "90d" (default "30d")
 *   - keyId:  optional filter to a specific key
 *
 * Returns: total requests, requests by endpoint, requests by day,
 * response code distribution, avg response time.
 *
 * See LDR-64: API usage events table + tracking middleware
 */

import { and, avg, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { apiKeys, apiUsageEvents } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof VALID_PERIODS)[number];

function periodToDays(period: Period): number {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/developer/usage
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();
  const url = new URL(req.url);

  // Parse period
  const periodParam = url.searchParams.get("period") ?? "30d";
  if (!VALID_PERIODS.includes(periodParam as Period)) {
    throw new ApiError("VALIDATION_ERROR", `period must be one of: ${VALID_PERIODS.join(", ")}`, { field: "period" });
  }
  const period = periodParam as Period;
  const days = periodToDays(period);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get user's key IDs
  const userKeys = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, user.id));

  const keyIds = userKeys.map((k) => k.id);

  // Optional keyId filter
  const keyIdFilter = url.searchParams.get("keyId");
  if (keyIdFilter) {
    if (!keyIds.includes(keyIdFilter)) {
      throw new ApiError("FORBIDDEN", "The specified key does not belong to you.");
    }
  }

  const targetKeyIds = keyIdFilter ? [keyIdFilter] : keyIds;

  // If user has no keys, return empty stats
  if (targetKeyIds.length === 0) {
    return jsonResponse(
      {
        data: {
          period,
          totalRequests: 0,
          avgResponseTimeMs: 0,
          byEndpoint: [],
          byDay: [],
          byStatusCode: [],
        },
      },
      200,
      { ...corsHeaders(), "X-Request-Id": ctx.requestId }
    );
  }

  // Build base conditions
  // biome-ignore lint/style/noNonNullAssertion: and() always returns defined when given 2+ args
  const baseConditions = and(inArray(apiUsageEvents.apiKeyId, targetKeyIds), gte(apiUsageEvents.createdAt, since))!;

  // Total requests + avg response time
  const [totals] = await db
    .select({
      totalRequests: count(),
      avgResponseTimeMs: avg(apiUsageEvents.responseTimeMs),
    })
    .from(apiUsageEvents)
    .where(baseConditions);

  // Requests by endpoint
  const byEndpoint = await db
    .select({
      endpoint: apiUsageEvents.endpoint,
      count: count(),
    })
    .from(apiUsageEvents)
    .where(baseConditions)
    .groupBy(apiUsageEvents.endpoint)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  // Requests by day
  const byDay = await db
    .select({
      date: sql<string>`DATE(${apiUsageEvents.createdAt})`.as("date"),
      count: count(),
    })
    .from(apiUsageEvents)
    .where(baseConditions)
    .groupBy(sql`DATE(${apiUsageEvents.createdAt})`)
    .orderBy(sql`DATE(${apiUsageEvents.createdAt})`);

  // Response code distribution
  const byStatusCode = await db
    .select({
      statusCode: apiUsageEvents.statusCode,
      count: count(),
    })
    .from(apiUsageEvents)
    .where(baseConditions)
    .groupBy(apiUsageEvents.statusCode)
    .orderBy(apiUsageEvents.statusCode);

  return jsonResponse(
    {
      data: {
        period,
        totalRequests: totals?.totalRequests ?? 0,
        avgResponseTimeMs: totals?.avgResponseTimeMs ? Math.round(Number(totals.avgResponseTimeMs)) : 0,
        byEndpoint: byEndpoint.map((r) => ({
          endpoint: r.endpoint,
          count: r.count,
        })),
        byDay: byDay.map((r) => ({
          date: r.date,
          count: r.count,
        })),
        byStatusCode: byStatusCode.map((r) => ({
          statusCode: r.statusCode,
          count: r.count,
        })),
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
