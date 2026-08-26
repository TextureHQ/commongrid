import { and, asc, desc, eq, gt, ilike, isNull, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { encodeCursor, parsePaginationParams } from "@/lib/api/pagination";
import { stripInternal } from "@/lib/api/public-response";
import { cachedJsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { regions, territories } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/territories — List territories with filtering
// ---------------------------------------------------------------------------

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);
  // Territories are database-only — ignore the feature flag.
  // JSON mode was never implemented; fall through to DB.
  return handleDatabaseMode(url);
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

async function handleDatabaseMode(url: URL) {
  const { cursor, limit, sort, order } = parsePaginationParams(url.searchParams, {
    allowedSorts: ["slug", "name", "state", "type"],
    defaultSort: "slug",
  });
  const db = getDb();

  // Filters
  const state = url.searchParams.get("state");
  const type = url.searchParams.get("type");
  const utilityId = url.searchParams.get("utilityId");
  const search = url.searchParams.get("search") ?? url.searchParams.get("q");

  // We'll join with regions to get name, slug, type, state
  const sortColumn =
    sort === "name" ? regions.name : sort === "state" ? regions.state : sort === "type" ? regions.type : regions.slug;
  const orderFn = order === "desc" ? desc : asc;

  // Build WHERE conditions
  const conditions = [];
  // Exclude soft-deleted entities
  conditions.push(isNull(territories.deletedAt));

  if (state) {
    conditions.push(eq(regions.state, state.toUpperCase()));
  }
  if (type) {
    conditions.push(eq(regions.type, type.toUpperCase()));
  }
  if (utilityId) {
    // Filter territories where a utility's service_territory_id matches the region
    conditions.push(
      sql`${territories.regionId} IN (
        SELECT service_territory_id FROM utilities WHERE id = ${utilityId}
      )`
    );
  }
  if (search) {
    conditions.push(ilike(regions.name, `%${search}%`));
  }

  // Track non-cursor conditions for count query
  const filterConditionCount = conditions.length;

  // Cursor pagination
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s.value as string));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Query with join
  let query = db
    .select({
      id: territories.id,
      regionId: territories.regionId,
      areaSqKm: territories.areaSqKm,
      vertexCount: territories.vertexCount,
      source: territories.source,
      sourceUrl: territories.sourceUrl,
      createdAt: territories.createdAt,
      updatedAt: territories.updatedAt,
      // From regions
      slug: regions.slug,
      name: regions.name,
      type: regions.type,
      state: regions.state,
      eiaId: regions.eiaId,
      customers: regions.customers,
    })
    .from(territories)
    .innerJoin(regions, eq(territories.regionId, regions.id))
    .orderBy(orderFn(sortColumn), asc(territories.id))
    .limit(limit + 1);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
  }

  const rows = await query;
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const sortKey = sort === "name" ? "name" : sort === "state" ? "state" : sort === "type" ? "type" : "slug";

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor({
          v: 1,
          s: {
            value: String(data[data.length - 1][sortKey] ?? ""),
          },
          id: data[data.length - 1].id,
        })
      : null;

  // Count with filter conditions only (no cursor)
  const countConditions = conditions.slice(0, filterConditionCount);

  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(territories)
    .innerJoin(regions, eq(territories.regionId, regions.id));

  if (countConditions.length > 0) {
    countQuery = countQuery.where(and(...countConditions)) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  return cachedJsonResponse(
    paginatedResponse(stripInternal(data), Number(count), nextCursor, limit),
    200,
    corsHeaders()
  );
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
