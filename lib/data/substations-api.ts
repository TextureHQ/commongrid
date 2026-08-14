/**
 * Data loading abstraction for substations.
 *
 * Reads from Postgres via Drizzle. Mirrors the power-plants-api pattern.
 */

import type { SubstationRecord } from "@/types/substations";

// ---------------------------------------------------------------------------
// Filters and Query Options
// ---------------------------------------------------------------------------

export interface SubstationFilters {
  state?: string;
  /** 'transmission' | 'distribution' | 'hybrid' | 'unknown' */
  substationType?: string;
  /** 'in_service' | 'out_of_service' | 'planned' | 'retired' | 'unknown' */
  status?: string;
  /** 'eia' | 'osm' | 'manual' | 'hybrid' */
  source?: string;
  /** Filter to substations with max voltage >= this kV. */
  minMaxVoltageKv?: number;
  /** Filter by owner utility id (exact match). */
  ownerUtilityId?: string;
  /** Min 2 chars. Matches against name and ownerName (case-insensitive). */
  search?: string;
}

export interface SubstationQueryOptions {
  filters?: SubstationFilters;
  sort?: "name" | "state" | "maxVoltageKv";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

type VoltageBand = SubstationRecord["voltageBand"];

function voltageBandForMax(kv: number | null): VoltageBand {
  if (kv === null) return "unknown";
  if (kv >= 345) return "extra-high";
  if (kv >= 230) return "high";
  if (kv >= 115) return "medium";
  if (kv >= 69) return "sub-trans";
  return "unknown";
}

function dbRowToSubstation(row: Record<string, unknown>): SubstationRecord {
  const minVoltageKv = (row.minVoltageKv as number | null) ?? null;
  const maxVoltageKv = (row.maxVoltageKv as number | null) ?? null;
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    ownerName: (row.ownerName as string | null) ?? null,
    state: row.state as string,
    county: (row.county as string | null) ?? null,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    minVoltageKv,
    maxVoltageKv,
    voltageBand: voltageBandForMax(maxVoltageKv ?? minVoltageKv),
    substationType: (row.substationType as SubstationRecord["substationType"]) ?? "unknown",
    status: (row.status as SubstationRecord["status"]) ?? "unknown",
    source: (row.source as SubstationRecord["source"]) ?? "manual",
    sourceUrl: (row.sourceUrl as string | null) ?? null,
    eiaId: (row.eiaId as string | null) ?? null,
    osmId: (row.osmId as string | null) ?? null,
    hifldLegacyId: (row.hifldLegacyId as string | null) ?? null,
  };
}

async function loadFromDb(options?: SubstationQueryOptions): Promise<SubstationRecord[]> {
  const { getDb } = await import("@/lib/db/client");
  const { substations } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, gte, desc, asc, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];
  const filters = options?.filters;

  // Exclude soft-deleted entities
  conditions.push(isNull(substations.deletedAt));
  if (filters?.state) conditions.push(eq(substations.state, filters.state.toUpperCase()));
  if (filters?.substationType) conditions.push(eq(substations.substationType, filters.substationType));
  if (filters?.status) conditions.push(eq(substations.status, filters.status));
  if (filters?.source) conditions.push(eq(substations.source, filters.source));
  if (filters?.ownerUtilityId) conditions.push(eq(substations.ownerUtilityId, filters.ownerUtilityId));
  if (filters?.minMaxVoltageKv !== undefined) {
    conditions.push(gte(substations.maxVoltageKv, filters.minMaxVoltageKv));
  }
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const pattern = `%${searchTerm}%`;
    const orClause = or(
      ilike(substations.name, pattern),
      ilike(substations.ownerName, pattern),
      ilike(substations.state, pattern)
    );
    if (orClause) conditions.push(orClause);
  }

  // Build ORDER BY clause
  const sortField = options?.sort ?? "name";
  const sortOrder = options?.order ?? "asc";
  const orderFn = sortOrder === "desc" ? desc : asc;

  const orderBy =
    sortField === "maxVoltageKv"
      ? [orderFn(substations.maxVoltageKv), asc(substations.name), asc(substations.id)]
      : sortField === "state"
        ? [orderFn(substations.state), asc(substations.name), asc(substations.id)]
        : [orderFn(substations.name), asc(substations.id)];

  const selectFields = {
    id: substations.id,
    slug: substations.slug,
    name: substations.name,
    ownerName: substations.ownerName,
    state: substations.state,
    county: substations.county,
    latitude: substations.latitude,
    longitude: substations.longitude,
    minVoltageKv: substations.minVoltageKv,
    maxVoltageKv: substations.maxVoltageKv,
    substationType: substations.substationType,
    status: substations.status,
    source: substations.source,
    sourceUrl: substations.sourceUrl,
    eiaId: substations.eiaId,
    osmId: substations.osmId,
    hifldLegacyId: substations.hifldLegacyId,
  };

  let query = db
    .select(selectFields)
    .from(substations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy);

  if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as typeof query;
  }

  const rows = await query;
  return rows.map(dbRowToSubstation);
}

async function loadBySlugFromDb(slug: string): Promise<SubstationRecord | null> {
  const { getDb } = await import("@/lib/db/client");
  const { substations } = await import("@/lib/db/schema");
  const { eq, and, isNull } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: substations.id,
      slug: substations.slug,
      name: substations.name,
      ownerName: substations.ownerName,
      state: substations.state,
      county: substations.county,
      latitude: substations.latitude,
      longitude: substations.longitude,
      minVoltageKv: substations.minVoltageKv,
      maxVoltageKv: substations.maxVoltageKv,
      substationType: substations.substationType,
      status: substations.status,
      source: substations.source,
      sourceUrl: substations.sourceUrl,
      eiaId: substations.eiaId,
      osmId: substations.osmId,
      hifldLegacyId: substations.hifldLegacyId,
    })
    .from(substations)
    .where(and(eq(substations.slug, slug), isNull(substations.deletedAt)))
    .limit(1);

  return rows.length > 0 ? dbRowToSubstation(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load substations with optional filters, sorting, and pagination.
 */
export async function loadSubstations(options?: SubstationQueryOptions): Promise<SubstationRecord[]> {
  return loadFromDb(options);
}

/**
 * Count substations matching the given filters.
 */
export async function countSubstations(filters?: SubstationFilters): Promise<number> {
  const { getDb } = await import("@/lib/db/client");
  const { substations } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, gte, count, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  conditions.push(isNull(substations.deletedAt));
  if (filters?.state) conditions.push(eq(substations.state, filters.state.toUpperCase()));
  if (filters?.substationType) conditions.push(eq(substations.substationType, filters.substationType));
  if (filters?.status) conditions.push(eq(substations.status, filters.status));
  if (filters?.source) conditions.push(eq(substations.source, filters.source));
  if (filters?.ownerUtilityId) conditions.push(eq(substations.ownerUtilityId, filters.ownerUtilityId));
  if (filters?.minMaxVoltageKv !== undefined) {
    conditions.push(gte(substations.maxVoltageKv, filters.minMaxVoltageKv));
  }
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const pattern = `%${searchTerm}%`;
    const orClause = or(
      ilike(substations.name, pattern),
      ilike(substations.ownerName, pattern),
      ilike(substations.state, pattern)
    );
    if (orClause) conditions.push(orClause);
  }

  const result = await db
    .select({ count: count() })
    .from(substations)
    .where(and(...conditions));

  return result[0]?.count ?? 0;
}

/**
 * Load a single substation by slug. Returns null if not found.
 */
export async function loadSubstationBySlug(slug: string): Promise<SubstationRecord | null> {
  return loadBySlugFromDb(slug);
}

/** Public connected-line row for GET /substations/{slug}/transmission-lines. */
export interface SubstationTransmissionLine {
  lineId: string;
  /** Derived from endpoint names — transmission_lines has no name column. */
  lineName: string | null;
  lineVoltageClass: string;
  lineVoltage: number | null;
  lineStatus: string;
  lineOwner: string;
  role: "from" | "to";
  matchConfidence: number | null;
}

const ENDPOINT_PLACEHOLDERS = new Set(["", "NOT AVAILABLE", "UNKNOWN", "N/A", "NA", "NONE"]);

function normalizeEndpointName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || ENDPOINT_PLACEHOLDERS.has(trimmed.toUpperCase())) return null;
  return trimmed;
}

/** Display label for a line when no dedicated name column exists. */
function lineNameFromEndpoints(sub1: string | null | undefined, sub2: string | null | undefined): string | null {
  const from = normalizeEndpointName(sub1);
  const to = normalizeEndpointName(sub2);
  if (from && to) return `${from} → ${to}`;
  return from ?? to;
}

/**
 * Load transmission lines connected to a substation slug.
 * Returns null when the substation does not exist; empty `lines` when none are linked.
 */
export async function loadSubstationTransmissionLinesBySlug(
  slug: string
): Promise<{ substationId: string; lines: SubstationTransmissionLine[] } | null> {
  const { getDb } = await import("@/lib/db/client");
  const { substations, transmissionLineEndpoints, transmissionLines } = await import("@/lib/db/schema");
  const { and, asc, eq, isNull } = await import("drizzle-orm");

  const db = getDb();

  const substationRows = await db
    .select({ id: substations.id })
    .from(substations)
    .where(and(eq(substations.slug, slug), isNull(substations.deletedAt)))
    .limit(1);

  if (substationRows.length === 0) {
    return null;
  }

  const substationId = substationRows[0].id;

  const rows = await db
    .select({
      lineId: transmissionLines.id,
      sub1: transmissionLines.sub1,
      sub2: transmissionLines.sub2,
      lineVoltageClass: transmissionLines.voltageClass,
      lineVoltage: transmissionLines.voltage,
      lineStatus: transmissionLines.status,
      lineOwner: transmissionLines.owner,
      role: transmissionLineEndpoints.role,
      matchConfidence: transmissionLineEndpoints.matchConfidence,
    })
    .from(transmissionLineEndpoints)
    .innerJoin(transmissionLines, eq(transmissionLineEndpoints.transmissionLineId, transmissionLines.id))
    .where(and(eq(transmissionLineEndpoints.substationId, substationId), isNull(transmissionLines.deletedAt)))
    .orderBy(asc(transmissionLineEndpoints.role), asc(transmissionLines.id));

  const lines: SubstationTransmissionLine[] = rows.map((row) => ({
    lineId: row.lineId,
    lineName: lineNameFromEndpoints(row.sub1, row.sub2),
    lineVoltageClass: row.lineVoltageClass,
    lineVoltage: row.lineVoltage,
    lineStatus: row.lineStatus,
    lineOwner: row.lineOwner,
    role: row.role as "from" | "to",
    matchConfidence: row.matchConfidence,
  }));

  return { substationId, lines };
}
