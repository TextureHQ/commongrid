import { and, arrayContains, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { encodeCursor, parsePaginationParams } from "@/lib/api/pagination";
import { stripInternal } from "@/lib/api/public-response";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/balancing-authorities — List balancing authorities
// ---------------------------------------------------------------------------

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);

  // Filter params
  const isoId = url.searchParams.get("isoId");
  const state = url.searchParams.get("state");

  const { cursor, limit, sort, order } = parsePaginationParams(url.searchParams, {
    allowedSorts: ["slug", "name", "shortName"],
    defaultSort: "slug",
  });
  const db = getDb();

  const sortColumn =
    sort === "name"
      ? balancingAuthorities.name
      : sort === "shortName"
        ? balancingAuthorities.shortName
        : balancingAuthorities.slug;
  const orderFn = order === "desc" ? desc : asc;

  const conditions = [];
  // Exclude soft-deleted entities
  conditions.push(isNull(balancingAuthorities.deletedAt));
  if (isoId) {
    conditions.push(eq(balancingAuthorities.isoId, isoId));
  }
  if (state) {
    conditions.push(arrayContains(balancingAuthorities.states, [state.toUpperCase()]));
  }
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s.value as string));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select()
    .from(balancingAuthorities)
    .orderBy(orderFn(sortColumn), asc(balancingAuthorities.id))
    .limit(limit + 1);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
  }

  const rows = await query;
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const sortKey = sort === "name" ? "name" : sort === "shortName" ? "shortName" : "slug";

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor({
          v: 1,
          s: { value: data[data.length - 1][sortKey] },
          id: data[data.length - 1].id,
        })
      : null;

  // Count with same filters (excluding cursor)
  const countConditions = [];
  countConditions.push(isNull(balancingAuthorities.deletedAt));
  if (isoId) {
    countConditions.push(eq(balancingAuthorities.isoId, isoId));
  }
  if (state) {
    countConditions.push(arrayContains(balancingAuthorities.states, [state.toUpperCase()]));
  }

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(balancingAuthorities);

  if (countConditions.length > 0) {
    countQuery = countQuery.where(and(...countConditions)) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  return jsonResponse(paginatedResponse(stripInternal(data), Number(count), nextCursor, limit), 200, corsHeaders());
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
