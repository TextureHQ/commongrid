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
// Filters
// ---------------------------------------------------------------------------

export interface PowerPlantFilters {
  state?: string;
  fuelCategory?: string;
  status?: string;
  /** Min 2 chars. Matches against name and utilityName (case-insensitive). */
  search?: string;
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
// DB source (placeholder — mirrors the programs pattern)
// ---------------------------------------------------------------------------

async function loadFromDb(filters?: PowerPlantFilters): Promise<PowerPlant[]> {
  // When DB mode is wired up, this will query the power_plants table.
  // For now, fall back to JSON so the endpoint still works.
  const plants = loadJson();
  return filters ? applyJsonFilters(plants, filters) : plants;
}

async function loadBySlugFromDb(slug: string): Promise<PowerPlant | null> {
  const plants = loadJson();
  return plants.find((p) => p.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load power plants, optionally filtered.
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_POWER_PLANTS flag.
 */
export async function loadPowerPlants(filters?: PowerPlantFilters): Promise<PowerPlant[]> {
  if (getDataSource("powerPlants") === "db") {
    return loadFromDb(filters);
  }

  const plants = loadJson();
  return filters ? applyJsonFilters(plants, filters) : plants;
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
