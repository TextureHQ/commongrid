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

function dbRowToPowerPlant(row: Record<string, unknown>): PowerPlant {
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
