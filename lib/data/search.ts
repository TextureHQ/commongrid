/**
 * Global search engine — searches across all entity types using the database.
 * DB search is currently a stub returning empty results until pg_trgm/tsvector is wired.
 */

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
// DB stub
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchFromDb(_entityType: EntityType, _query: string, _limit: number): Promise<SearchResult[]> {
  // TODO: implement using pg_trgm similarity + tsvector full-text search
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search across all (or selected) entity types using the database.
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

  for (const entityType of entityTypes) {
    results.set(entityType, await searchFromDb(entityType, query, limit));
  }

  return {
    results,
    source: "db",
  };
}
