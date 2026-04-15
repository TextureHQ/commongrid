export type DataSource = "database" | "json";

/**
 * Feature flags for dual-mode data loading.
 * Controls whether each entity type reads from the database or from static JSON files.
 * All flags default to "json" (current behavior) for safe rollback.
 *
 * Set via environment variables:
 *   NEXT_PUBLIC_FF_DB_UTILITIES=database  → utilities read from Postgres
 *   NEXT_PUBLIC_FF_DB_UTILITIES=json      → utilities read from static JSON (default)
 */
const ENTITY_DATA_SOURCE_MAP: Record<string, string | undefined> = {
  utilities: process.env.NEXT_PUBLIC_FF_DB_UTILITIES,
  isos: process.env.NEXT_PUBLIC_FF_DB_ISOS,
  rtos: process.env.NEXT_PUBLIC_FF_DB_RTOS,
  balancingAuthorities: process.env.NEXT_PUBLIC_FF_DB_BAS,
  regions: process.env.NEXT_PUBLIC_FF_DB_REGIONS,
  powerPlants: process.env.NEXT_PUBLIC_FF_DB_POWER_PLANTS,
  evStations: process.env.NEXT_PUBLIC_FF_DB_EV_STATIONS,
  transmissionLines: process.env.NEXT_PUBLIC_FF_DB_TRANSMISSION,
  pricingNodes: process.env.NEXT_PUBLIC_FF_DB_PRICING_NODES,
  programs: process.env.NEXT_PUBLIC_FF_DB_PROGRAMS,
};

/**
 * Get the data source for an entity type.
 * Returns "json" (safe default) if the environment variable is not set or invalid.
 */
export function getDataSource(entityType: string): DataSource {
  const value = ENTITY_DATA_SOURCE_MAP[entityType];
  if (value === "database") return "database";
  return "json";
}

/**
 * Check if an entity type is using the database.
 */
export function isUsingDatabase(entityType: string): boolean {
  return getDataSource(entityType) === "database";
}

/**
 * Check if ANY entity type is using the database.
 * Useful for conditionally importing database modules.
 */
export function isAnyEntityUsingDatabase(): boolean {
  return Object.keys(ENTITY_DATA_SOURCE_MAP).some(
    (key) => getDataSource(key) === "database"
  );
}

/**
 * Get the current data source configuration for all entities.
 * Useful for debugging and health checks.
 */
export function getAllDataSources(): Record<string, DataSource> {
  const result: Record<string, DataSource> = {};
  for (const key of Object.keys(ENTITY_DATA_SOURCE_MAP)) {
    result[key] = getDataSource(key);
  }
  return result;
}
