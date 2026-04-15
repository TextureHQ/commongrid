/**
 * Data loading abstraction for power plants.
 *
 * Reads from static JSON (default) or Postgres via Drizzle, controlled by
 * the NEXT_PUBLIC_FF_DB_POWER_PLANTS feature flag.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDataSource } from "@/lib/feature-flags";
import type { FuelCategory, PowerPlant } from "@/types/entities";

// ---------------------------------------------------------------------------
// Filters and Query Options
// ---------------------------------------------------------------------------

export interface PowerPlantFilters {
  state?: string;
  fuelCategory?: string;
  status?: string;
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
// JSON source
// ---------------------------------------------------------------------------

let _jsonCache: PowerPlant[] | null = null;

function loadJson(): PowerPlant[] {
  if (_jsonCache) return _jsonCache;
  const filePath = join(process.cwd(), "data", "power-plants.json");
  _jsonCache = JSON.parse(readFileSync(filePath, "utf-8")) as PowerPlant[];
  return _jsonCache;
}

function applyJsonFilters(plants: PowerPlant[], filters: PowerPlantFilters): PowerPlant[] {
  let result = plants;

  if (filters.state) {
    result = result.filter((p) => p.state === filters.state);
  }
  if (filters.fuelCategory) {
    result = result.filter((p) => p.fuelCategory === (filters.fuelCategory as FuelCategory));
  }
  if (filters.status) {
    result = result.filter((p) => p.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((p) => p.name.toLowerCase().includes(q) || p.utilityName.toLowerCase().includes(q));
  }

  return result;
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
  const { eq, ilike, and, or, sql, desc, asc } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];
  const filters = options?.filters;

  if (filters?.state) conditions.push(eq(powerPlants.state, filters.state));
  if (filters?.fuelCategory) conditions.push(eq(powerPlants.fuelCategory, filters.fuelCategory));
  if (filters?.status) conditions.push(eq(powerPlants.status, filters.status));
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    conditions.push(
      or(
        sql`${powerPlants.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
        ilike(powerPlants.name, `%${searchTerm}%`)
      )!
    );
  }

  // Build ORDER BY clause
  const sortField = options?.sort ?? "name";
  const sortOrder = options?.order ?? "asc";
  const orderFn = sortOrder === "desc" ? desc : asc;
  
  let orderBy;
  if (sortField === "totalCapacityMw") {
    orderBy = [orderFn(powerPlants.totalCapacityMw), asc(powerPlants.name), asc(powerPlants.id)];
  } else if (sortField === "state") {
    orderBy = [orderFn(powerPlants.state), asc(powerPlants.name), asc(powerPlants.id)];
  } else {
    orderBy = [orderFn(powerPlants.name), asc(powerPlants.id)];
  }

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
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_POWER_PLANTS flag.
 */
export async function loadPowerPlants(options?: PowerPlantQueryOptions): Promise<PowerPlant[]> {
  if (getDataSource("powerPlants") === "db") {
    return loadFromDb(options);
  }

  // JSON fallback (no pagination support — caller must handle in-memory)
  const plants = loadJson();
  return options?.filters ? applyJsonFilters(plants, options.filters) : plants;
}

/**
 * Count power plants matching the given filters.
 * Uses accurate COUNT query when in DB mode, or counts JSON in-memory.
 */
export async function countPowerPlants(filters?: PowerPlantFilters): Promise<number> {
  if (getDataSource("powerPlants") === "db") {
    const { getDb } = await import("@/lib/db/client");
    const { powerPlants } = await import("@/lib/db/schema");
    const { eq, ilike, and, or, sql, count } = await import("drizzle-orm");
    type DrizzleSQL = ReturnType<typeof eq>;

    const db = getDb();
    const conditions: DrizzleSQL[] = [];

    if (filters?.state) conditions.push(eq(powerPlants.state, filters.state));
    if (filters?.fuelCategory) conditions.push(eq(powerPlants.fuelCategory, filters.fuelCategory));
    if (filters?.status) conditions.push(eq(powerPlants.status, filters.status));
    if (filters?.search) {
      const searchTerm = filters.search.trim();
      conditions.push(
        or(
          sql`${powerPlants.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
          ilike(powerPlants.name, `%${searchTerm}%`)
        )!
      );
    }

    const result = await db
      .select({ count: count() })
      .from(powerPlants)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.count ?? 0;
  }

  // JSON fallback
  const plants = loadJson();
  const filtered = filters ? applyJsonFilters(plants, filters) : plants;
  return filtered.length;
}

/**
 * Load a single power plant by slug.
 * Returns null if not found.
 */
export async function loadPowerPlantBySlug(slug: string): Promise<PowerPlant | null> {
  if (getDataSource("powerPlants") === "db") {
    return loadBySlugFromDb(slug);
  }

  const plants = loadJson();
  return plants.find((p) => p.slug === slug) ?? null;
}
