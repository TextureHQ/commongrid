import { and, asc, desc, gt, isNull, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { encodeCursor, parsePaginationParams } from "@/lib/api/pagination";
import { stripInternal } from "@/lib/api/public-response";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { isos } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/isos — List all ISOs
// ---------------------------------------------------------------------------

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);

  const { cursor, limit, sort, order } = parsePaginationParams(url.searchParams, {
    allowedSorts: ["slug", "name", "shortName"],
    defaultSort: "slug",
  });
  const db = getDb();

  const sortColumn = sort === "name" ? isos.name : sort === "shortName" ? isos.shortName : isos.slug;
  const orderFn = order === "desc" ? desc : asc;

  const notDeletedCondition = isNull(isos.deletedAt);

  let query = db
    .select()
    .from(isos)
    .orderBy(orderFn(sortColumn), asc(isos.id))
    .limit(limit + 1);

  if (cursor) {
    const op = order === "desc" ? lt : gt;
    query = query.where(and(notDeletedCondition, op(sortColumn, cursor.s.value as string))) as typeof query;
  } else {
    query = query.where(notDeletedCondition) as typeof query;
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

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(isos).where(notDeletedCondition);

  return jsonResponse(paginatedResponse(stripInternal(data), Number(count), nextCursor, limit), 200, corsHeaders());
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
