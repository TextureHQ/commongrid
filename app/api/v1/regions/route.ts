import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import { regions } from "@/lib/db/schema";
import {
  withRequestId,
  withErrorHandling,
  withTiming,
  generateRequestId,
} from "@/lib/api/middleware";
import {
  jsonResponse,
  paginatedResponse,
} from "@/lib/api/response";
import { corsHeaders } from "@/lib/api/cors";
import { parsePaginationParams, encodeCursor } from "@/lib/api/pagination";
import type { RouteContext } from "@/lib/api/types";
import { eq, asc, desc, gt, lt, sql, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/v1/regions — List regions
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const url = new URL(req.url);
  const source = getDataSource("regions");

  // Filter params
  const type = url.searchParams.get("type");
  const state = url.searchParams.get("state");

  if (source === "json") {
    const allRegions = (await import("@/data/regions.json")).default;
    let filtered = allRegions;

    if (type) {
      filtered = filtered.filter((r: { type: string }) => r.type === type);
    }
    if (state) {
      filtered = filtered.filter(
        (r: { state: string | null }) =>
          r.state?.toUpperCase() === state.toUpperCase()
      );
    }

    // Apply pagination for JSON mode (regions can be ~3K records)
    const { limit } = parsePaginationParams(url.searchParams);
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") ?? "1", 10) || 1
    );
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    return jsonResponse(
      paginatedResponse(
        paged,
        filtered.length,
        hasMore ? `page:${page + 1}` : null,
        limit
      ),
      200,
      corsHeaders()
    );
  }

  // Database mode
  const db = getDb();
  const { cursor, limit, sort, order } = parsePaginationParams(
    url.searchParams
  );

  const sortColumn =
    sort === "name"
      ? regions.name
      : sort === "type"
        ? regions.type
        : sort === "state"
          ? regions.state
          : regions.slug;
  const orderFn = order === "desc" ? desc : asc;

  const conditions = [];
  if (type) {
    conditions.push(eq(regions.type, type));
  }
  if (state) {
    conditions.push(eq(regions.state, state.toUpperCase()));
  }
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s["value"] as string));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select()
    .from(regions)
    .orderBy(orderFn(sortColumn), asc(regions.id))
    .limit(limit + 1);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
  }

  const rows = await query;
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const sortKey =
    sort === "name"
      ? "name"
      : sort === "type"
        ? "type"
        : sort === "state"
          ? "state"
          : "slug";

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor({
          v: 1,
          s: { value: data[data.length - 1][sortKey] },
          id: data[data.length - 1].id,
        })
      : null;

  // Count with same filters
  const countConditions = [];
  if (type) {
    countConditions.push(eq(regions.type, type));
  }
  if (state) {
    countConditions.push(eq(regions.state, state.toUpperCase()));
  }

  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(regions);

  if (countConditions.length > 0) {
    countQuery = countQuery.where(
      and(...countConditions)
    ) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  return jsonResponse(
    paginatedResponse(data, Number(count), nextCursor, limit),
    200,
    corsHeaders()
  );
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
