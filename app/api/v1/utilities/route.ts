import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { encodeCursor, parsePaginationParams } from "@/lib/api/pagination";
import { parseFieldsParam, selectFields, stripInternal } from "@/lib/api/public-response";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities, isos, rtos, utilities } from "@/lib/db/schema";

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
  // Bulk multi-id filter: ?eiaIds=19791,19792,19793
  eiaIds: string[] | null;
  // Numeric bounds on scale metrics
  minCustomers: number | null;
  maxCustomers: number | null;
  minAmiMeters: number | null;
  minTotalMeters: number | null;
  // Content presence flags
  hasLogo: boolean | null;
  hasWebsite: boolean | null;
  hasTerritory: boolean | null;
}

interface DbFilterParams extends FilterParams {
  include: string | null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/utilities — List utilities with filtering
// ---------------------------------------------------------------------------

// Bulk-id request cap. Keeps a single call under Postgres's parameter limit and
// makes rate limits predictable. Consumers needing more should paginate.
const MAX_EIA_IDS_PER_REQUEST = 500;

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseBooleanFlag(raw: string | null): boolean | null {
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

/**
 * Encode cursor, returning null if CURSOR_SECRET is not set (dev degraded mode).
 *
 * Matches the behaviour of the other list routes (power-plants, programs,
 * ev-stations, pricing-nodes, transmission-lines) so a missing CURSOR_SECRET
 * costs you pagination rather than 500ing the whole endpoint.
 */
function tryEncodeCursor(data: Parameters<typeof encodeCursor>[0]): string | null {
  try {
    return encodeCursor(data);
  } catch {
    return null;
  }
}

function parseEiaIds(raw: string | null): string[] | null {
  if (raw === null || raw.trim() === "") return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) return null;
  return ids.slice(0, MAX_EIA_IDS_PER_REQUEST);
}

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);

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

  // Bulk + numeric + presence filters
  const eiaIds = parseEiaIds(url.searchParams.get("eiaIds") ?? url.searchParams.get("eia_ids"));
  const minCustomers = parsePositiveInt(url.searchParams.get("minCustomers") ?? url.searchParams.get("min_customers"));
  const maxCustomers = parsePositiveInt(url.searchParams.get("maxCustomers") ?? url.searchParams.get("max_customers"));
  const minAmiMeters = parsePositiveInt(url.searchParams.get("minAmiMeters") ?? url.searchParams.get("min_ami_meters"));
  const minTotalMeters = parsePositiveInt(
    url.searchParams.get("minTotalMeters") ?? url.searchParams.get("min_total_meters")
  );
  const hasLogo = parseBooleanFlag(url.searchParams.get("hasLogo") ?? url.searchParams.get("has_logo"));
  const hasWebsite = parseBooleanFlag(url.searchParams.get("hasWebsite") ?? url.searchParams.get("has_website"));
  const hasTerritory = parseBooleanFlag(url.searchParams.get("hasTerritory") ?? url.searchParams.get("has_territory"));

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
    eiaIds,
    minCustomers,
    maxCustomers,
    minAmiMeters,
    minTotalMeters,
    hasLogo,
    hasWebsite,
    hasTerritory,
  };

  return handleDatabaseMode({ ...filterParams, include });
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

async function handleDatabaseMode(params: DbFilterParams) {
  const db = getDb();
  const { cursor, limit, sort, order } = parsePaginationParams(params.url.searchParams);

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
  // Exclude soft-deleted entities
  conditions.push(isNull(utilities.deletedAt));
  if (params.segment) {
    conditions.push(eq(utilities.segment, params.segment));
  }
  if (params.status) {
    conditions.push(eq(utilities.status, params.status));
  }
  if (params.state) {
    conditions.push(ilike(utilities.jurisdiction, `%${params.state.toUpperCase()}%`));
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
    conditions.push(eq(utilities.hasGeneration, params.hasGeneration === "true"));
  }
  if (params.hasTransmission !== null) {
    conditions.push(eq(utilities.hasTransmission, params.hasTransmission === "true"));
  }
  if (params.hasDistribution !== null) {
    conditions.push(eq(utilities.hasDistribution, params.hasDistribution === "true"));
  }
  if (params.eiaIds && params.eiaIds.length > 0) {
    conditions.push(inArray(utilities.eiaId, params.eiaIds));
  }
  if (params.minCustomers !== null) {
    conditions.push(gte(utilities.customerCount, params.minCustomers));
  }
  if (params.maxCustomers !== null) {
    conditions.push(lte(utilities.customerCount, params.maxCustomers));
  }
  if (params.minAmiMeters !== null) {
    conditions.push(gte(utilities.amiMeterCount, params.minAmiMeters));
  }
  if (params.minTotalMeters !== null) {
    conditions.push(gte(utilities.totalMeterCount, params.minTotalMeters));
  }
  if (params.hasLogo !== null) {
    conditions.push(
      params.hasLogo
        ? sql`${utilities.logo} IS NOT NULL AND length(${utilities.logo}) > 0`
        : sql`${utilities.logo} IS NULL OR length(${utilities.logo}) = 0`
    );
  }
  if (params.hasWebsite !== null) {
    conditions.push(
      params.hasWebsite
        ? sql`${utilities.website} IS NOT NULL AND length(${utilities.website}) > 0`
        : sql`${utilities.website} IS NULL OR length(${utilities.website}) = 0`
    );
  }
  if (params.hasTerritory !== null) {
    conditions.push(
      params.hasTerritory ? isNotNull(utilities.serviceTerritoryId) : isNull(utilities.serviceTerritoryId)
    );
  }

  // Full-text search
  if (params.search) {
    const searchTerm = params.search.trim();
    conditions.push(
      // biome-ignore lint/style/noNonNullAssertion: or() with 2+ args never returns undefined
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
    conditions.push(op(sortColumn, cursor.s.value as string));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
    sort === "name" ? "name" : sort === "customerCount" ? "customerCount" : sort === "segment" ? "segment" : "slug";

  const nextCursor =
    hasMore && data.length > 0
      ? tryEncodeCursor({
          v: 1,
          s: {
            value: String(data[data.length - 1][sortKey] ?? ""),
          },
          id: data[data.length - 1].id,
        })
      : null;

  // Count with filter conditions only (no cursor)
  const countConditions = conditions.slice(0, filterConditionCount);

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(utilities);

  if (countConditions.length > 0) {
    countQuery = countQuery.where(and(...countConditions)) as typeof countQuery;
  }

  const [{ count }] = await countQuery;

  // Resolve includes
  let resultData: Record<string, unknown>[] = data;
  if (params.include && data.length > 0) {
    const includes = params.include.split(",").map((i) => i.trim());
    resultData = await resolveIncludes(db, data, includes);
  }

  // Sanitize internal fields first, then apply sparse-fieldset projection.
  // Order matters: stripping must happen before projection so a field like
  // `searchVector` can't be resurrected by an explicit `?fields=searchVector`
  // request.
  resultData = stripInternal(resultData) as Record<string, unknown>[];

  const fieldList = parseFieldsParam(params.fields);
  if (fieldList) {
    resultData = resultData.map((item) => selectFields(item, fieldList));
  }

  return jsonResponse(paginatedResponse(resultData, Number(count), nextCursor, limit), 200, {
    ...corsHeaders(),
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  });
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
    if (includes.includes("iso") && row.isoId) isoIds.add(row.isoId as string);
    if (includes.includes("rto") && row.rtoId) rtoIds.add(row.rtoId as string);
    if (includes.includes("ba") && row.balancingAuthorityId) baIds.add(row.balancingAuthorityId as string);
  }

  const [isoMap, rtoMap, baMap] = await Promise.all([
    isoIds.size > 0 ? fetchEntitiesById(db, isos, [...isoIds]) : new Map(),
    rtoIds.size > 0 ? fetchEntitiesById(db, rtos, [...rtoIds]) : new Map(),
    baIds.size > 0 ? fetchEntitiesById(db, balancingAuthorities, [...baIds]) : new Map(),
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
      enriched._ba = baMap.get(row.balancingAuthorityId as string) ?? null;
    }
    return enriched;
  });
}

async function fetchEntitiesById(
  db: DbClient,
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle table type varies by table; using explicit typing would require complex generics
  table: any,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const rows = await db.select().from(table).where(sql`${table.id} = ANY(${ids})`);

  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    map.set((row as Record<string, unknown>).id as string, row as Record<string, unknown>);
  }
  return map;
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
