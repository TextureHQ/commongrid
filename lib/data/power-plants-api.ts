/**
 * Data loading abstraction for power plants.
 *
 * Reads from Postgres via Drizzle.
 */

import type { FuelCategory, PowerPlant } from "@/types/entities";

// ---------------------------------------------------------------------------
// Filters and Query Options
// ---------------------------------------------------------------------------

export interface PowerPlantFilters {
  state?: string;
  fuelCategory?: string;
  status?: string;
  /** Filter by utility ID (exact match on utilityId field). */
  utilityId?: string;
  /** Filter by balancing authority ID (exact match on balancingAuthorityId field). */
  baId?: string;
  /** Min 2 chars. Matches against name and utilityName (case-insensitive). */
  search?: string;
}

export interface PowerPlantQueryOptions {
  filters?: PowerPlantFilters;
  sort?: "name" | "totalCapacityMw" | "state";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

export function dbRowToPowerPlant(row: Record<string, unknown>): PowerPlant {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    plantCode: row.plantCode as string,
    utilityId: row.utilityId as string | null,
    utilityName: row.utilityName as string,
    balancingAuthorityId: row.balancingAuthorityId as string | null,
    baCode: row.baCode as string | null,
    state: row.state as string,
    county: row.county as string | null,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    nercRegion: row.nercRegion as string | null,
    sector: row.sector as string,
    primaryFuel: row.primaryFuel as string | null,
    fuelCategory: row.fuelCategory as FuelCategory,
    technologies: row.technologies as string[],
    energySources: row.energySources as string[],
    totalCapacityMw: row.totalCapacityMw as number,
    generatorCount: row.generatorCount as number,
    operatingYear: row.operatingYear as number | null,
    gridVoltageKv: row.gridVoltageKv as number | null,
    status: row.status as "operable" | "proposed",
    proposedCapacityMw: row.proposedCapacityMw as number | null,
    proposedOnlineYear: row.proposedOnlineYear as number | null,
  };
}

async function loadFromDb(options?: PowerPlantQueryOptions): Promise<PowerPlant[]> {
  const { getDb } = await import("@/lib/db/client");
  const { powerPlants } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, sql, desc, asc, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];
  const filters = options?.filters;

  // Exclude soft-deleted entities
  conditions.push(isNull(powerPlants.deletedAt));
  if (filters?.state) conditions.push(eq(powerPlants.state, filters.state));
  if (filters?.fuelCategory) conditions.push(eq(powerPlants.fuelCategory, filters.fuelCategory));
  if (filters?.status) conditions.push(eq(powerPlants.status, filters.status));
  if (filters?.utilityId) conditions.push(eq(powerPlants.utilityId, filters.utilityId));
  if (filters?.baId) conditions.push(eq(powerPlants.balancingAuthorityId, filters.baId));
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const searchCondition = or(
      sql`${powerPlants.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
      ilike(powerPlants.name, `%${searchTerm}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  // Build ORDER BY clause
  const sortField = options?.sort ?? "name";
  const sortOrder = options?.order ?? "asc";
  const orderFn = sortOrder === "desc" ? desc : asc;

  const orderBy =
    sortField === "totalCapacityMw"
      ? [orderFn(powerPlants.totalCapacityMw), asc(powerPlants.name), asc(powerPlants.id)]
      : sortField === "state"
        ? [orderFn(powerPlants.state), asc(powerPlants.name), asc(powerPlants.id)]
        : [orderFn(powerPlants.name), asc(powerPlants.id)];

  let query = db
    .select({
      id: powerPlants.id,
      slug: powerPlants.slug,
      name: powerPlants.name,
      plantCode: powerPlants.plantCode,
      utilityId: powerPlants.utilityId,
      utilityName: powerPlants.utilityName,
      balancingAuthorityId: powerPlants.balancingAuthorityId,
      baCode: powerPlants.baCode,
      state: powerPlants.state,
      county: powerPlants.county,
      latitude: powerPlants.latitude,
      longitude: powerPlants.longitude,
      nercRegion: powerPlants.nercRegion,
      sector: powerPlants.sector,
      primaryFuel: powerPlants.primaryFuel,
      fuelCategory: powerPlants.fuelCategory,
      technologies: powerPlants.technologies,
      energySources: powerPlants.energySources,
      totalCapacityMw: powerPlants.totalCapacityMw,
      generatorCount: powerPlants.generatorCount,
      operatingYear: powerPlants.operatingYear,
      gridVoltageKv: powerPlants.gridVoltageKv,
      status: powerPlants.status,
      proposedCapacityMw: powerPlants.proposedCapacityMw,
      proposedOnlineYear: powerPlants.proposedOnlineYear,
    })
    .from(powerPlants)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy);

  // Apply pagination
  if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as typeof query;
  }

  const rows = await query;
  return rows.map(dbRowToPowerPlant);
}

async function loadBySlugFromDb(slug: string): Promise<PowerPlant | null> {
  const { getDb } = await import("@/lib/db/client");
  const { powerPlants } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: powerPlants.id,
      slug: powerPlants.slug,
      name: powerPlants.name,
      plantCode: powerPlants.plantCode,
      utilityId: powerPlants.utilityId,
      utilityName: powerPlants.utilityName,
      balancingAuthorityId: powerPlants.balancingAuthorityId,
      baCode: powerPlants.baCode,
      state: powerPlants.state,
      county: powerPlants.county,
      latitude: powerPlants.latitude,
      longitude: powerPlants.longitude,
      nercRegion: powerPlants.nercRegion,
      sector: powerPlants.sector,
      primaryFuel: powerPlants.primaryFuel,
      fuelCategory: powerPlants.fuelCategory,
      technologies: powerPlants.technologies,
      energySources: powerPlants.energySources,
      totalCapacityMw: powerPlants.totalCapacityMw,
      generatorCount: powerPlants.generatorCount,
      operatingYear: powerPlants.operatingYear,
      gridVoltageKv: powerPlants.gridVoltageKv,
      status: powerPlants.status,
      proposedCapacityMw: powerPlants.proposedCapacityMw,
      proposedOnlineYear: powerPlants.proposedOnlineYear,
    })
    .from(powerPlants)
    .where(eq(powerPlants.slug, slug))
    .limit(1);

  return rows.length > 0 ? dbRowToPowerPlant(rows[0]) : null;
}

/**
 * Resolve an EIA plant code (EIA-860 `Plant Code`) to the plant's canonical
 * slug.
 *
 * EIA plant codes are the de-facto industry identifier for a generating
 * facility: they're what EIA-860/860M/923 filings, ISO/RTO node registries,
 * and most third-party datasets key on. CommonGrid addresses plants by slug,
 * so anything arriving with a plant code needs this hop to build a URL.
 *
 * Plant codes are unique across non-deleted plants, so a match is
 * unambiguous. Returns null when no live plant carries the code.
 */
async function loadSlugByPlantCodeFromDb(plantCode: string): Promise<string | null> {
  const { getDb } = await import("@/lib/db/client");
  const { powerPlants } = await import("@/lib/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({ slug: powerPlants.slug })
    .from(powerPlants)
    .where(and(eq(powerPlants.plantCode, plantCode), isNull(powerPlants.deletedAt)))
    .limit(1);

  return rows.length > 0 ? ((rows[0] as { slug: string | null }).slug ?? null) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load power plants with optional filters, sorting, and pagination.
 */
export async function loadPowerPlants(options?: PowerPlantQueryOptions): Promise<PowerPlant[]> {
  return loadFromDb(options);
}

/**
 * Count power plants matching the given filters.
 */
export async function countPowerPlants(filters?: PowerPlantFilters): Promise<number> {
  const { getDb } = await import("@/lib/db/client");
  const { powerPlants } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, sql, count, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(powerPlants.deletedAt));
  if (filters?.state) conditions.push(eq(powerPlants.state, filters.state));
  if (filters?.fuelCategory) conditions.push(eq(powerPlants.fuelCategory, filters.fuelCategory));
  if (filters?.status) conditions.push(eq(powerPlants.status, filters.status));
  if (filters?.utilityId) conditions.push(eq(powerPlants.utilityId, filters.utilityId));
  if (filters?.baId) conditions.push(eq(powerPlants.balancingAuthorityId, filters.baId));
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const searchCondition = or(
      sql`${powerPlants.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
      ilike(powerPlants.name, `%${searchTerm}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const result = await db
    .select({ count: count() })
    .from(powerPlants)
    .where(and(...conditions));

  return result[0]?.count ?? 0;
}

/**
 * Load a single power plant by slug.
 * Returns null if not found.
 */
export async function loadPowerPlantBySlug(slug: string): Promise<PowerPlant | null> {
  return loadBySlugFromDb(slug);
}

/**
 * A plant code is a bare EIA integer identifier (e.g. `2503`). Slugs always
 * contain at least one letter, so the two namespaces can't collide — which
 * lets `/power-plants/:idOrCode` accept either form unambiguously.
 */
export function isPlantCode(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Resolve an EIA plant code to the plant's canonical CommonGrid slug.
 * Returns null when no live plant carries that code.
 */
export async function loadPowerPlantSlugByPlantCode(plantCode: string): Promise<string | null> {
  return loadSlugByPlantCodeFromDb(plantCode);
}

/**
 * Load a single power plant by EIA plant code.
 * Returns null if no live plant carries that code.
 */
export async function loadPowerPlantByPlantCode(plantCode: string): Promise<PowerPlant | null> {
  const slug = await loadSlugByPlantCodeFromDb(plantCode);
  if (!slug) return null;
  return loadBySlugFromDb(slug);
}

/** Public interconnection row for GET /power-plants/{slug}/substations. */
export interface PowerPlantInterconnection {
  substationId: string;
  substationName: string;
  substationType: string;
  /** Derived voltage band from substation max/min kV (substations have no voltage_class column). */
  voltageClass: string;
  owner: string | null;
  distanceKm: number;
  isPrimary: boolean;
}

function voltageClassForKv(kv: number | null): string {
  if (kv === null) return "unknown";
  if (kv >= 345) return "extra-high";
  if (kv >= 230) return "high";
  if (kv >= 115) return "medium";
  if (kv >= 69) return "sub-trans";
  return "unknown";
}

/**
 * Load interconnected substations for a power plant slug.
 * Returns null when the plant does not exist; empty `interconnections` when none are linked.
 */
export async function loadPowerPlantInterconnectionsBySlug(
  slug: string
): Promise<{ plantId: string; interconnections: PowerPlantInterconnection[] } | null> {
  const { getDb } = await import("@/lib/db/client");
  const { powerPlantInterconnections, powerPlants, substations } = await import("@/lib/db/schema");
  const { and, asc, desc, eq, isNull } = await import("drizzle-orm");

  const db = getDb();

  const plantRows = await db
    .select({ id: powerPlants.id })
    .from(powerPlants)
    .where(and(eq(powerPlants.slug, slug), isNull(powerPlants.deletedAt)))
    .limit(1);

  if (plantRows.length === 0) {
    return null;
  }

  const plantId = plantRows[0].id;

  const rows = await db
    .select({
      substationId: substations.id,
      substationName: substations.name,
      substationType: substations.substationType,
      minVoltageKv: substations.minVoltageKv,
      maxVoltageKv: substations.maxVoltageKv,
      owner: substations.ownerName,
      distanceMeters: powerPlantInterconnections.distanceMeters,
      isPrimary: powerPlantInterconnections.isPrimary,
    })
    .from(powerPlantInterconnections)
    .innerJoin(substations, eq(powerPlantInterconnections.substationId, substations.id))
    .where(and(eq(powerPlantInterconnections.powerPlantId, plantId), isNull(substations.deletedAt)))
    .orderBy(desc(powerPlantInterconnections.isPrimary), asc(powerPlantInterconnections.distanceMeters));

  const interconnections: PowerPlantInterconnection[] = rows.map((row) => ({
    substationId: row.substationId,
    substationName: row.substationName,
    substationType: row.substationType,
    voltageClass: voltageClassForKv(row.maxVoltageKv ?? row.minVoltageKv),
    owner: row.owner,
    distanceKm: row.distanceMeters / 1000,
    isPrimary: row.isPrimary,
  }));

  return { plantId, interconnections };
}
