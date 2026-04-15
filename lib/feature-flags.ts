export type DataSource = "db" | "json";

/**
 * Feature flags for dual-mode data loading.
 * Controls whether each entity type reads from the database or from static JSON files.
 * All flags default to false/JSON (current behavior) for safe rollback.
 *
 * Global override:
 *   NEXT_PUBLIC_FF_DB_ENABLED=true → enables database for ALL entities
 *
 * Per-entity flags (only used if global override is not set):
 *   NEXT_PUBLIC_FF_DB_UTILITIES=true  → utilities read from Postgres
 *   NEXT_PUBLIC_FF_DB_UTILITIES=false → utilities read from static JSON (default)
 */
const ENTITY_FLAGS: Record<string, boolean> = {
  utilities: process.env.NEXT_PUBLIC_FF_DB_UTILITIES === "true",
  isos: process.env.NEXT_PUBLIC_FF_DB_ISOS === "true",
  rtos: process.env.NEXT_PUBLIC_FF_DB_RTOS === "true",
  balancingAuthorities: process.env.NEXT_PUBLIC_FF_DB_BAS === "true",
  regions: process.env.NEXT_PUBLIC_FF_DB_REGIONS === "true",
  powerPlants: process.env.NEXT_PUBLIC_FF_DB_POWER_PLANTS === "true",
  evStations: process.env.NEXT_PUBLIC_FF_DB_EV_STATIONS === "true",
  transmissionLines: process.env.NEXT_PUBLIC_FF_DB_TRANSMISSION === "true",
  pricingNodes: process.env.NEXT_PUBLIC_FF_DB_PRICING_NODES === "true",
  programs: process.env.NEXT_PUBLIC_FF_DB_PROGRAMS === "true",
  territories: process.env.NEXT_PUBLIC_FF_DB_TERRITORIES === "true",
};

/**
 * Global override flag - when true, enables database for ALL entities.
 */
const GLOBAL_DB_ENABLED = process.env.NEXT_PUBLIC_FF_DB_ENABLED === "true";

/**
 * Get the data source for an entity type.
 * Returns "db" if the global flag OR the entity-specific flag is true.
 * Returns "json" (safe default) otherwise.
 */
export function getDataSource(entityType: string): DataSource {
  if (GLOBAL_DB_ENABLED) return "db";
  return ENTITY_FLAGS[entityType] === true ? "db" : "json";
}

/**
 * Check if an entity type is using the database.
 */
export function isUsingDatabase(entityType: string): boolean {
  return getDataSource(entityType) === "db";
}

/**
 * Check if ANY entity type is using the database.
 * Useful for conditionally importing database modules.
 */
export function isAnyEntityUsingDatabase(): boolean {
  return Object.keys(ENTITY_FLAGS).some((key) => getDataSource(key) === "db");
}

/**
 * Get the current data source configuration for all entities.
 * Useful for debugging and health checks.
 */
export function getAllDataSources(): Record<string, DataSource> {
  const result: Record<string, DataSource> = {};
  for (const key of Object.keys(ENTITY_FLAGS)) {
    result[key] = getDataSource(key);
  }
  return result;
}
