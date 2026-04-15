import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities } from "@/lib/db/schema";
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
import { eq, asc, desc, gt, lt, sql, and, arrayContains } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/v1/balancing-authorities — List balancing authorities
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const url = new URL(req.url);
  const source = getDataSource("balancingAuthorities");

  // Filter params
  const isoId = url.searchParams.get("isoId");
  const state = url.searchParams.get("state");

  if (source === "json") {
    const allBAs = (await import("@/data/balancing-authorities.json")).default;
    let filtered = allBAs;

    if (isoId) {
      filtered = filtered.filter(
        (ba: { isoId: string | null }) => ba.isoId === isoId
      );
    }
    if (state) {
      filtered = filtered.filter((ba: { states: string[] }) =>
        ba.states.includes(state.toUpperCase())
      );
    }

    return jsonResponse(
      paginatedResponse(filtered, filtered.length, null, filtered.length),
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
      ? balancingAuthorities.name
      : sort === "shortName"
        ? balancingAuthorities.shortName
        : balancingAuthorities.slug;
  const orderFn = order === "desc" ? desc : asc;

  const conditions = [];
  if (isoId) {
    conditions.push(eq(balancingAuthorities.isoId, isoId));
  }
  if (state) {
    conditions.push(
      arrayContains(balancingAuthorities.states, [state.toUpperCase()])
    );
  }
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s["value"] as string));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

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

  const sortKey =
    sort === "name"
      ? "name"
      : sort === "shortName"
        ? "shortName"
        : "slug";

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
  if (isoId) {
    countConditions.push(eq(balancingAuthorities.isoId, isoId));
  }
  if (state) {
    countConditions.push(
      arrayContains(balancingAuthorities.states, [state.toUpperCase()])
    );
  }

  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(balancingAuthorities);

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
