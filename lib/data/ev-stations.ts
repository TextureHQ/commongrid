/**
 * Data loading abstraction for EV charging stations.
 *
 * Reads from Postgres via Drizzle.
 */

import type { EVAccessCode, EVOwnerTypeCode, EVStation, EVStatusCode } from "@/types/ev-charging";

// ---------------------------------------------------------------------------
// Filters and Query Options
// ---------------------------------------------------------------------------

export interface EVStationFilters {
  state?: string;
  city?: string;
  network?: string;
  accessCode?: string;
  statusCode?: string;
  /** Min 2 chars. Matches against stationName and city (case-insensitive). */
  search?: string;
}

export interface EVStationQueryOptions {
  filters?: EVStationFilters;
  sort?: "stationName" | "city" | "state";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

function dbRowToEVStation(row: Record<string, unknown>): EVStation {
  return {
    id: row.id as string,
    slug: row.slug as string,
    stationName: row.stationName as string,
    streetAddress: row.streetAddress as string,
    city: row.city as string,
    state: row.state as string,
    zip: row.zip as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    evNetwork: row.evNetwork as string | null,
    evLevel1EvseNum: row.evLevel1EvseNum as number,
    evLevel2EvseNum: row.evLevel2EvseNum as number,
    evDcFastNum: row.evDcFastNum as number,
    evConnectorTypes: row.evConnectorTypes as string[],
    accessCode: row.accessCode as EVAccessCode,
    statusCode: row.statusCode as EVStatusCode,
    openDate: row.openDate as string | null,
    facilityType: row.facilityType as string | null,
    ownerTypeCode: row.ownerTypeCode as EVOwnerTypeCode | null,
    evPricing: row.evPricing as string | null,
  };
}

async function loadFromDb(options?: EVStationQueryOptions): Promise<EVStation[]> {
  const { getDb } = await import("@/lib/db/client");
  const { evStations } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, sql, desc, asc, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];
  const filters = options?.filters;

  // Exclude soft-deleted entities
  conditions.push(isNull(evStations.deletedAt));
  if (filters?.state) conditions.push(eq(evStations.state, filters.state));
  if (filters?.city) conditions.push(ilike(evStations.city, filters.city));
  if (filters?.network) conditions.push(eq(evStations.evNetwork, filters.network));
  if (filters?.accessCode) conditions.push(eq(evStations.accessCode, filters.accessCode));
  if (filters?.statusCode) conditions.push(eq(evStations.statusCode, filters.statusCode));
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const searchCondition = or(
      sql`${evStations.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
      ilike(evStations.stationName, `%${searchTerm}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  // Build ORDER BY clause
  const sortField = options?.sort ?? "stationName";
  const sortOrder = options?.order ?? "asc";
  const orderFn = sortOrder === "desc" ? desc : asc;

  const orderBy =
    sortField === "city"
      ? [orderFn(evStations.city), asc(evStations.stationName), asc(evStations.id)]
      : sortField === "state"
        ? [orderFn(evStations.state), asc(evStations.stationName), asc(evStations.id)]
        : [orderFn(evStations.stationName), asc(evStations.id)];

  let query = db
    .select({
      id: evStations.id,
      slug: evStations.slug,
      stationName: evStations.stationName,
      streetAddress: evStations.streetAddress,
      city: evStations.city,
      state: evStations.state,
      zip: evStations.zip,
      latitude: evStations.latitude,
      longitude: evStations.longitude,
      evNetwork: evStations.evNetwork,
      evLevel1EvseNum: evStations.evLevel1EvseNum,
      evLevel2EvseNum: evStations.evLevel2EvseNum,
      evDcFastNum: evStations.evDcFastNum,
      evConnectorTypes: evStations.evConnectorTypes,
      accessCode: evStations.accessCode,
      statusCode: evStations.statusCode,
      openDate: evStations.openDate,
      facilityType: evStations.facilityType,
      ownerTypeCode: evStations.ownerTypeCode,
      evPricing: evStations.evPricing,
    })
    .from(evStations)
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
  return rows.map(dbRowToEVStation);
}

async function loadBySlugFromDb(slug: string): Promise<EVStation | null> {
  const { getDb } = await import("@/lib/db/client");
  const { evStations } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: evStations.id,
      slug: evStations.slug,
      stationName: evStations.stationName,
      streetAddress: evStations.streetAddress,
      city: evStations.city,
      state: evStations.state,
      zip: evStations.zip,
      latitude: evStations.latitude,
      longitude: evStations.longitude,
      evNetwork: evStations.evNetwork,
      evLevel1EvseNum: evStations.evLevel1EvseNum,
      evLevel2EvseNum: evStations.evLevel2EvseNum,
      evDcFastNum: evStations.evDcFastNum,
      evConnectorTypes: evStations.evConnectorTypes,
      accessCode: evStations.accessCode,
      statusCode: evStations.statusCode,
      openDate: evStations.openDate,
      facilityType: evStations.facilityType,
      ownerTypeCode: evStations.ownerTypeCode,
      evPricing: evStations.evPricing,
    })
    .from(evStations)
    .where(eq(evStations.slug, slug))
    .limit(1);

  return rows.length > 0 ? dbRowToEVStation(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load EV stations with optional filters, sorting, and pagination.
 */
export async function loadEVStations(options?: EVStationQueryOptions): Promise<EVStation[]> {
  return loadFromDb(options);
}

/**
 * Count EV stations matching the given filters.
 */
export async function countEVStations(filters?: EVStationFilters): Promise<number> {
  const { getDb } = await import("@/lib/db/client");
  const { evStations } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, sql, count, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(evStations.deletedAt));
  if (filters?.state) conditions.push(eq(evStations.state, filters.state));
  if (filters?.city) conditions.push(ilike(evStations.city, filters.city));
  if (filters?.network) conditions.push(eq(evStations.evNetwork, filters.network));
  if (filters?.accessCode) conditions.push(eq(evStations.accessCode, filters.accessCode));
  if (filters?.statusCode) conditions.push(eq(evStations.statusCode, filters.statusCode));
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    const searchCondition = or(
      sql`${evStations.searchVector} @@ plainto_tsquery('english', ${searchTerm})`,
      ilike(evStations.stationName, `%${searchTerm}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const result = await db
    .select({ count: count() })
    .from(evStations)
    .where(and(...conditions));

  return result[0]?.count ?? 0;
}

/**
 * Load a single EV station by slug.
 * Returns null if not found.
 */
export async function loadEVStationBySlug(slug: string): Promise<EVStation | null> {
  return loadBySlugFromDb(slug);
}
