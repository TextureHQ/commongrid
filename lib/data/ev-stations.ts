/**
 * Data loading abstraction for EV charging stations.
 *
 * Reads from static JSON (default) or Postgres via Drizzle, controlled by
 * the NEXT_PUBLIC_FF_DB_EV_STATIONS feature flag.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDataSource } from "@/lib/feature-flags";
import type { EVAccessCode, EVStation, EVStatusCode } from "@/types/ev-charging";

// ---------------------------------------------------------------------------
// Filters
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

// ---------------------------------------------------------------------------
// JSON source
// ---------------------------------------------------------------------------

let _jsonCache: EVStation[] | null = null;

function loadJson(): EVStation[] {
  if (_jsonCache) return _jsonCache;
  const filePath = join(process.cwd(), "data", "ev-charging.json");
  _jsonCache = JSON.parse(readFileSync(filePath, "utf-8")) as EVStation[];
  return _jsonCache;
}

function applyJsonFilters(stations: EVStation[], filters: EVStationFilters): EVStation[] {
  let result = stations;

  if (filters.state) {
    result = result.filter((s) => s.state === filters.state);
  }
  if (filters.city) {
    const c = filters.city.toLowerCase();
    result = result.filter((s) => s.city.toLowerCase() === c);
  }
  if (filters.network) {
    result = result.filter((s) => s.evNetwork === filters.network);
  }
  if (filters.accessCode) {
    result = result.filter((s) => s.accessCode === (filters.accessCode as EVAccessCode));
  }
  if (filters.statusCode) {
    result = result.filter((s) => s.statusCode === (filters.statusCode as EVStatusCode));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((s) => s.stationName.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB source (placeholder — mirrors the programs pattern)
// ---------------------------------------------------------------------------

async function loadFromDb(filters?: EVStationFilters): Promise<EVStation[]> {
  // When DB mode is wired up, this will query the ev_stations table.
  // For now, fall back to JSON so the endpoint still works.
  const stations = loadJson();
  return filters ? applyJsonFilters(stations, filters) : stations;
}

async function loadBySlugFromDb(slug: string): Promise<EVStation | null> {
  const stations = loadJson();
  return stations.find((s) => s.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load EV stations, optionally filtered.
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_EV_STATIONS flag.
 */
export async function loadEVStations(filters?: EVStationFilters): Promise<EVStation[]> {
  if (getDataSource("evStations") === "db") {
    return loadFromDb(filters);
  }

  const stations = loadJson();
  return filters ? applyJsonFilters(stations, filters) : stations;
}

/**
 * Load a single EV station by slug.
 * Returns null if not found.
 */
export async function loadEVStationBySlug(slug: string): Promise<EVStation | null> {
  if (getDataSource("evStations") === "db") {
    return loadBySlugFromDb(slug);
  }

  const stations = loadJson();
  return stations.find((s) => s.slug === slug) ?? null;
}
