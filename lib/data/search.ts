/**
 * Global search engine abstraction.
 *
 * Searches across all entity types using either JSON data (default) or the
 * database (future), controlled per-entity by feature flags.
 *
 * For JSON mode:  simple case-insensitive string matching on name/slug fields.
 * For DB mode:    stub — returns empty results until pg_trgm/tsvector is wired.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType =
  | "utility"
  | "program"
  | "power-plant"
  | "ev-station"
  | "pricing-node"
  | "transmission-line"
  | "iso"
  | "rto"
  | "balancing-authority";

/** All supported entity types in search order. */
export const ALL_ENTITY_TYPES: EntityType[] = [
  "utility",
  "program",
  "power-plant",
  "ev-station",
  "pricing-node",
  "transmission-line",
  "iso",
  "rto",
  "balancing-authority",
];

/**
 * Maps URL/query-param type names (plural, kebab-case) to internal EntityType
 * (singular, kebab-case). Used to parse the `types` query parameter.
 */
export const TYPE_SLUG_MAP: Record<string, EntityType> = {
  utilities: "utility",
  programs: "program",
  "power-plants": "power-plant",
  "ev-stations": "ev-station",
  "pricing-nodes": "pricing-node",
  "transmission-lines": "transmission-line",
  isos: "iso",
  rtos: "rto",
  "balancing-authorities": "balancing-authority",
};

export interface SearchResult {
  slug: string;
  name: string;
  entityType: EntityType;
  matchField: string;
  snippet?: string;
}

export interface SearchOptions {
  /**
   * Filter to specific entity types using URL param names
   * (e.g. 'utilities', 'power-plants').  Defaults to all types.
   */
  types?: string[];
  /** Max results per entity type. Defaults to 5. */
  limit?: number;
}

export interface SearchAllResult {
  results: Map<EntityType, SearchResult[]>;
  source: "json" | "db";
}

// ---------------------------------------------------------------------------
// JSON caches (module-level, loaded once per process)
// ---------------------------------------------------------------------------

const _caches: Record<string, unknown[]> = {};

function loadJsonFile<T>(filename: string): T[] {
  const filePath = join(process.cwd(), "data", filename);
  return JSON.parse(readFileSync(filePath, "utf-8")) as T[];
}

function getJsonCache<T>(key: string, filename: string): T[] {
  if (!_caches[key]) {
    _caches[key] = loadJsonFile<T>(filename);
  }
  return _caches[key] as T[];
}

// ---------------------------------------------------------------------------
// Per-entity JSON search
// ---------------------------------------------------------------------------

type SimpleEntity = { id: string; slug: string; name: string };
type SimpleEntityWithShortName = SimpleEntity & { shortName: string };
type EvEntity = { id: string; slug: string; stationName: string };
type TransmissionEntity = {
  id: string;
  owner: string;
  sub1: string;
  sub2: string;
};

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function searchSimple(items: SimpleEntity[], query: string, entityType: EntityType, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of items) {
    if (results.length >= limit) break;
    const nameMatch = matchesQuery(item.name, query);
    const slugMatch = matchesQuery(item.slug, query);
    if (nameMatch || slugMatch) {
      results.push({
        slug: item.slug,
        name: item.name,
        entityType,
        matchField: nameMatch ? "name" : "slug",
      });
    }
  }
  return results;
}

function searchWithShortName(
  items: SimpleEntityWithShortName[],
  query: string,
  entityType: EntityType,
  limit: number
): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of items) {
    if (results.length >= limit) break;
    const nameMatch = matchesQuery(item.name, query);
    const slugMatch = matchesQuery(item.slug, query);
    const shortNameMatch = matchesQuery(item.shortName, query);
    if (nameMatch || slugMatch || shortNameMatch) {
      results.push({
        slug: item.slug,
        name: item.name,
        entityType,
        matchField: nameMatch ? "name" : shortNameMatch ? "shortName" : "slug",
      });
    }
  }
  return results;
}

function searchJsonEntities(entityType: EntityType, query: string, limit: number): SearchResult[] {
  const q = query.toLowerCase();

  switch (entityType) {
    case "utility":
      return searchSimple(getJsonCache<SimpleEntity>("utility", "utilities.json"), q, entityType, limit);

    case "program":
      return searchSimple(getJsonCache<SimpleEntity>("program", "programs.json"), q, entityType, limit);

    case "power-plant":
      return searchSimple(getJsonCache<SimpleEntity>("power-plant", "power-plants.json"), q, entityType, limit);

    case "ev-station": {
      const items = getJsonCache<EvEntity>("ev-station", "ev-charging.json");
      const results: SearchResult[] = [];
      for (const item of items) {
        if (results.length >= limit) break;
        const nameMatch = matchesQuery(item.stationName, q);
        const slugMatch = matchesQuery(item.slug, q);
        if (nameMatch || slugMatch) {
          results.push({
            slug: item.slug,
            name: item.stationName,
            entityType,
            matchField: nameMatch ? "stationName" : "slug",
          });
        }
      }
      return results;
    }

    case "pricing-node":
      return searchSimple(getJsonCache<SimpleEntity>("pricing-node", "pricing-nodes.json"), q, entityType, limit);

    case "transmission-line": {
      const items = getJsonCache<TransmissionEntity>("transmission-line", "transmission-lines.json");
      const results: SearchResult[] = [];
      for (const item of items) {
        if (results.length >= limit) break;
        if (matchesQuery(item.owner, q)) {
          results.push({
            slug: item.id,
            name: `${item.owner}: ${item.sub1} – ${item.sub2}`,
            entityType,
            matchField: "owner",
          });
        }
      }
      return results;
    }

    case "iso":
      return searchWithShortName(getJsonCache<SimpleEntityWithShortName>("iso", "isos.json"), q, entityType, limit);

    case "rto":
      return searchWithShortName(getJsonCache<SimpleEntityWithShortName>("rto", "rtos.json"), q, entityType, limit);

    case "balancing-authority":
      return searchWithShortName(
        getJsonCache<SimpleEntityWithShortName>("balancing-authority", "balancing-authorities.json"),
        q,
        entityType,
        limit
      );
  }
}

// ---------------------------------------------------------------------------
// DB stub
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchFromDb(_entityType: EntityType, _query: string, _limit: number): Promise<SearchResult[]> {
  // TODO: implement using pg_trgm similarity + tsvector full-text search
  return [];
}

// ---------------------------------------------------------------------------
// Feature flag key mapping
// ---------------------------------------------------------------------------

const ENTITY_TYPE_TO_FLAG_KEY: Record<EntityType, string> = {
  utility: "utilities",
  program: "programs",
  "power-plant": "powerPlants",
  "ev-station": "evStations",
  "pricing-node": "pricingNodes",
  "transmission-line": "transmissionLines",
  iso: "isos",
  rto: "rtos",
  "balancing-authority": "balancingAuthorities",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search across all (or selected) entity types.
 *
 * In JSON mode: loads data lazily (module-level cache), case-insensitive
 * string matching on name and slug fields.
 *
 * In DB mode: returns empty results (stub — not yet implemented).
 *
 * @param query   Search query (min 2 chars, caller is responsible for validation).
 * @param options Entity type filter and per-type result limit.
 */
export async function searchAll(query: string, options: SearchOptions = {}): Promise<SearchAllResult> {
  const limit = options.limit ?? 5;

  // Resolve which entity types to search
  let entityTypes: EntityType[];
  if (options.types && options.types.length > 0) {
    entityTypes = options.types.map((t) => TYPE_SLUG_MAP[t]).filter((t): t is EntityType => t !== undefined);
    // Fall back to all types if every supplied type was unrecognized
    if (entityTypes.length === 0) {
      entityTypes = ALL_ENTITY_TYPES;
    }
  } else {
    entityTypes = ALL_ENTITY_TYPES;
  }

  const results = new Map<EntityType, SearchResult[]>();
  let anyDatabase = false;

  for (const entityType of entityTypes) {
    const flagKey = ENTITY_TYPE_TO_FLAG_KEY[entityType];
    const source = getDataSource(flagKey);

    if (source === "db") {
      anyDatabase = true;
      results.set(entityType, await searchFromDb(entityType, query, limit));
    } else {
      results.set(entityType, searchJsonEntities(entityType, query, limit));
    }
  }

  return {
    results,
    source: anyDatabase ? "db" : "json",
  };
}
