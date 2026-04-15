import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import {
  utilities,
  isos,
  rtos,
  balancingAuthorities,
} from "@/lib/db/schema";
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
import { eq, asc, desc, gt, lt, sql, and, ilike, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types for JSON data
// ---------------------------------------------------------------------------

interface JsonUtility {
  id: string;
  slug: string;
  name: string;
  eiaName: string | null;
  shortName: string | null;
  segment: string;
  status: string;
  jurisdiction: string | null;
  isoId: string | null;
  rtoId: string | null;
  balancingAuthorityId: string | null;
  hasGeneration: boolean | null;
  hasTransmission: boolean | null;
  hasDistribution: boolean | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sparse field selection helper
// ---------------------------------------------------------------------------

function selectFields(
  items: Record<string, unknown>[],
  fields: string[]
): Record<string, unknown>[] {
  return items.map((item) => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in item) {
        result[field] = item[field];
      }
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Filter params interface
// ---------------------------------------------------------------------------

interface FilterParams {
  url: URL;
  segment: string | null;
  status: string | null;
  state: string | null;
  iso: string | null;
  rto: string | null;
  ba: string | null;
  search: string | null;
  hasGeneration: string | null;
  hasTransmission: string | null;
  hasDistribution: string | null;
  fields: string | null;
}

interface DbFilterParams extends FilterParams {
  include: string | null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/utilities — List utilities with filtering
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const url = new URL(req.url);
  const source = getDataSource("utilities");

  // Common filter params
  const segment = url.searchParams.get("segment");
  const status = url.searchParams.get("status");
  const state = url.searchParams.get("state");
  const isoParam = url.searchParams.get("iso");
  const rtoParam = url.searchParams.get("rto");
  const baParam = url.searchParams.get("ba");
  const search = url.searchParams.get("search") ?? url.searchParams.get("q");
  const hasGeneration = url.searchParams.get("hasGeneration");
  const hasTransmission = url.searchParams.get("hasTransmission");
  const hasDistribution = url.searchParams.get("hasDistribution");
  const fields = url.searchParams.get("fields");
  const include = url.searchParams.get("include");

  const filterParams: FilterParams = {
    url,
    segment,
    status,
    state,
    iso: isoParam,
    rto: rtoParam,
    ba: baParam,
    search,
    hasGeneration,
    hasTransmission,
    hasDistribution,
    fields,
  };

  if (source === "json") {
    return handleJsonMode(filterParams);
  }

  return handleDatabaseMode({ ...filterParams, include });
}

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

async function handleJsonMode(params: FilterParams) {
  const allUtilities = (await import("@/data/utilities.json"))
    .default as JsonUtility[];
  let filtered = allUtilities;

  if (params.segment) {
    filtered = filtered.filter((u) => u.segment === params.segment);
  }
  if (params.status) {
    filtered = filtered.filter((u) => u.status === params.status);
  }
  if (params.state) {
    const stateUpper = params.state.toUpperCase();
    filtered = filtered.filter(
      (u) =>
        u.jurisdiction !== null &&
        u.jurisdiction
          .split(",")
          .map((s: string) => s.trim())
          .includes(stateUpper)
    );
  }
  if (params.iso) {
    filtered = filtered.filter((u) => u.isoId === params.iso);
  }
  if (params.rto) {
    filtered = filtered.filter((u) => u.rtoId === params.rto);
  }
  if (params.ba) {
    filtered = filtered.filter((u) => u.balancingAuthorityId === params.ba);
  }
  if (params.search) {
    const term = params.search.toLowerCase();
    filtered = filtered.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        (u.eiaName && u.eiaName.toLowerCase().includes(term)) ||
        (u.shortName && u.shortName.toLowerCase().includes(term))
    );
  }
  if (params.hasGeneration !== null) {
    const val = params.hasGeneration === "true";
    filtered = filtered.filter((u) => u.hasGeneration === val);
  }
  if (params.hasTransmission !== null) {
    const val = params.hasTransmission === "true";
    filtered = filtered.filter((u) => u.hasTransmission === val);
  }
  if (params.hasDistribution !== null) {
    const val = params.hasDistribution === "true";
    filtered = filtered.filter((u) => u.hasDistribution === val);
  }

  // Pagination
  const { limit } = parsePaginationParams(params.url.searchParams);
  const page = Math.max(
    1,
    parseInt(params.url.searchParams.get("page") ?? "1", 10) || 1
  );
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < filtered.length;

  // Sparse fields
  let result: Record<string, unknown>[] = paged;
  if (params.fields) {
    const fieldList = params.fields.split(",").map((f) => f.trim());
    result = selectFields(paged, fieldList);
  }

  return jsonResponse(
    paginatedResponse(
      result,
      filtered.length,
      hasMore ? `page:${page + 1}` : null,
      limit
    ),
    200,
    corsHeaders()
  );
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

async function handleDatabaseMode(params: DbFilterParams) {
  const db = getDb();
  const { cursor, limit, sort, order } = parsePaginationParams(
    params.url.searchParams
  );

  const sortColumn =
    sort === "name"
      ? utilities.name
      : sort === "customerCount"
        ? utilities.customerCount
        : sort === "segment"
          ? utilities.segment
          : utilities.slug;
  const orderFn = order === "desc" ? desc : asc;

  // Build WHERE conditions
  const conditions = [];
  if (params.segment) {
    conditions.push(eq(utilities.segment, params.segment));
  }
  if (params.status) {
    conditions.push(eq(utilities.status, params.status));
  }
  if (params.state) {
    conditions.push(
      ilike(utilities.jurisdiction, `%${params.state.toUpperCase()}%`)
    );
  }
  if (params.iso) {
    conditions.push(eq(utilities.isoId, params.iso));
  }
  if (params.rto) {
    conditions.push(eq(utilities.rtoId, params.rto));
  }
  if (params.ba) {
    conditions.push(eq(utilities.balancingAuthorityId, params.ba));
  }
  if (params.hasGeneration !== null) {
    conditions.push(
      eq(utilities.hasGeneration, params.hasGeneration === "true")
    );
  }
  if (params.hasTransmission !== null) {
    conditions.push(
      eq(utilities.hasTransmission, params.hasTransmission === "true")
    );
  }
  if (params.hasDistribution !== null) {
    conditions.push(
      eq(utilities.hasDistribution, params.hasDistribution === "true")
    );
  }

  // Full-text search
  if (params.search) {
    const searchTerm = params.search.trim();
    conditions.push(
      or(
        sql`${utilities.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
        ilike(utilities.name, `%${searchTerm}%`)
      )!
    );
  }

  // Spatial (lat/lng) — point-in-polygon via territories
  const lat = params.url.searchParams.get("lat");
  const lng = params.url.searchParams.get("lng");
  if (lat && lng) {
    conditions.push(
      sql`${utilities.serviceTerritoryId} IN (
        SELECT t.region_id FROM territories t
        WHERE ST_Contains(t.geometry, ST_SetSRID(ST_Point(${parseFloat(lng)}, ${parseFloat(lat)}), 4326))
      )`
    );
  }

  // Track non-cursor conditions for count query
  const filterConditionCount = conditions.length;

  // Cursor pagination
  if (cursor) {
    const op = order === "desc" ? lt : gt;
    conditions.push(op(sortColumn, cursor.s["value"] as string));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select()
    .from(utilities)
    .orderBy(orderFn(sortColumn), asc(utilities.id))
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
      : sort === "customerCount"
        ? "customerCount"
        : sort === "segment"
          ? "segment"
          : "slug";

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
    .from(utilities);

  if (countConditions.length > 0) {
    countQuery = countQuery.where(
      and(...countConditions)
    ) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  // Resolve includes
  let resultData: Record<string, unknown>[] = data;
  if (params.include && data.length > 0) {
    const includes = params.include.split(",").map((i) => i.trim());
    resultData = await resolveIncludes(db, data, includes);
  }

  // Sparse fields
  if (params.fields) {
    const fieldList = params.fields.split(",").map((f) => f.trim());
    resultData = selectFields(resultData, fieldList);
  }

  return jsonResponse(
    paginatedResponse(resultData, Number(count), nextCursor, limit),
    200,
    corsHeaders()
  );
}

// ---------------------------------------------------------------------------
// Resolve related entities for ?include=iso,rto,ba
// ---------------------------------------------------------------------------

type DbClient = ReturnType<typeof getDb>;

async function resolveIncludes(
  db: DbClient,
  data: Record<string, unknown>[],
  includes: string[]
): Promise<Record<string, unknown>[]> {
  const isoIds = new Set<string>();
  const rtoIds = new Set<string>();
  const baIds = new Set<string>();

  for (const row of data) {
    if (includes.includes("iso") && row.isoId)
      isoIds.add(row.isoId as string);
    if (includes.includes("rto") && row.rtoId)
      rtoIds.add(row.rtoId as string);
    if (includes.includes("ba") && row.balancingAuthorityId)
      baIds.add(row.balancingAuthorityId as string);
  }

  const [isoMap, rtoMap, baMap] = await Promise.all([
    isoIds.size > 0 ? fetchEntitiesById(db, isos, [...isoIds]) : new Map(),
    rtoIds.size > 0 ? fetchEntitiesById(db, rtos, [...rtoIds]) : new Map(),
    baIds.size > 0
      ? fetchEntitiesById(db, balancingAuthorities, [...baIds])
      : new Map(),
  ]);

  return data.map((row) => {
    const enriched = { ...row };
    if (includes.includes("iso") && row.isoId) {
      enriched._iso = isoMap.get(row.isoId as string) ?? null;
    }
    if (includes.includes("rto") && row.rtoId) {
      enriched._rto = rtoMap.get(row.rtoId as string) ?? null;
    }
    if (includes.includes("ba") && row.balancingAuthorityId) {
      enriched._ba =
        baMap.get(row.balancingAuthorityId as string) ?? null;
    }
    return enriched;
  });
}

async function fetchEntitiesById(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const rows = await db
    .select()
    .from(table)
    .where(sql`${table.id} = ANY(${ids})`);

  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    map.set(
      (row as Record<string, unknown>).id as string,
      row as Record<string, unknown>
    );
  }
  return map;
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
