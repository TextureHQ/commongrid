import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { encodeCursor, parsePaginationParams } from "@/lib/api/pagination";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { regions } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/regions — List regions
// ---------------------------------------------------------------------------

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);

  // Filter params
  const type = url.searchParams.get("type");
  const state = url.searchParams.get("state");

  const db = getDb();
  const { cursor, limit, sort, order } = parsePaginationParams(url.searchParams);

  const sortColumn =
    sort === "name" ? regions.name : sort === "type" ? regions.type : sort === "state" ? regions.state : regions.slug;
  const orderFn = order === "desc" ? desc : asc;

  const conditions = [];
  // Exclude soft-deleted entities
  conditions.push(isNull(regions.deletedAt));
  if (type) {
    conditions.push(eq(regions.type, type));
  }
  if (state) {
    conditions.push(eq(regions.state, state.toUpperCase()));
  }
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s.value as string));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

  const sortKey = sort === "name" ? "name" : sort === "type" ? "type" : sort === "state" ? "state" : "slug";

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
  countConditions.push(isNull(regions.deletedAt));
  if (type) {
    countConditions.push(eq(regions.type, type));
  }
  if (state) {
    countConditions.push(eq(regions.state, state.toUpperCase()));
  }

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(regions);

  if (countConditions.length > 0) {
    countQuery = countQuery.where(and(...countConditions)) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  return jsonResponse(paginatedResponse(data, Number(count), nextCursor, limit), 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
