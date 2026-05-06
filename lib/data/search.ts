/**
 * Global search engine — searches across all entity types using the database.
 *
 * Context: this previously returned `[]` for every type because `searchFromDb`
 * was a TODO stub (see ALL-731 / Morgan's Relay bug report, 2026-05-06 #3).
 * The `search_vector` tsvector columns on utilities, programs, power_plants,
 * and ev_stations are already populated by `GENERATED ALWAYS AS STORED`
 * expressions — the endpoint just wasn't reading them. This file is the
 * read path.
 *
 * Strategy per-entity-type:
 *   1. If the table has a `search_vector` tsvector column (utilities,
 *      programs, power_plants, ev_stations), rank rows using
 *      `search_vector @@ websearch_to_tsquery(...)` combined (via OR) with a
 *      case-insensitive ILIKE fallback on the primary name column. This
 *      catches both stemmed / weighted matches ("tri-state" ~ "Tri-State G&T")
 *      and literal substring matches that may not survive tsvector stemming.
 *   2. If the table has no search_vector (pricing_nodes, transmission_lines,
 *      isos, rtos, balancing_authorities), fall back to name ILIKE.
 *
 * `websearch_to_tsquery` is used instead of `plainto_tsquery` because it
 * gracefully handles punctuation like hyphens ("tri-state") without throwing
 * on malformed input.
 *
 * All queries are read-only and respect `deleted_at IS NULL`.
 */

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

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
// Per-entity-type query configuration
// ---------------------------------------------------------------------------

/**
 * Table-name → column configuration for building the SELECT statement.
 *
 * Table and column identifiers must be trusted (hard-coded) — they are
 * inlined into `sql.raw(...)` calls. User-supplied query values are always
 * parameterized via drizzle's `sql` tagged-template binding.
 */
interface EntityConfig {
  /** Postgres table name. */
  table: string;
  /** Column holding the public slug. For transmission lines we fall back to `id`. */
  slugColumn: string;
  /** Column expression used for the display name. */
  nameColumn: string;
  /** Whether the table has a `search_vector` tsvector column. */
  hasSearchVector: boolean;
  /**
   * `matchField` value reported on each SearchResult. Reflects the most
   * significant column the tsvector / trigram index is built on.
   */
  matchField: string;
}

export const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  utility: {
    table: "utilities",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: true,
    matchField: "name",
  },
  program: {
    table: "programs",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: true,
    matchField: "name",
  },
  "power-plant": {
    table: "power_plants",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: true,
    matchField: "name",
  },
  "ev-station": {
    table: "ev_stations",
    slugColumn: "slug",
    nameColumn: "station_name",
    hasSearchVector: true,
    matchField: "station_name",
  },
  "pricing-node": {
    table: "pricing_nodes",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: false,
    matchField: "name",
  },
  "transmission-line": {
    // Transmission lines have no `slug` / `name` — surface the owner and id.
    table: "transmission_lines",
    slugColumn: "id",
    nameColumn: "owner",
    hasSearchVector: false,
    matchField: "owner",
  },
  iso: {
    table: "isos",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: false,
    matchField: "name",
  },
  rto: {
    table: "rtos",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: false,
    matchField: "name",
  },
  "balancing-authority": {
    table: "balancing_authorities",
    slugColumn: "slug",
    nameColumn: "name",
    hasSearchVector: false,
    matchField: "name",
  },
};

// ---------------------------------------------------------------------------
// DB search
// ---------------------------------------------------------------------------

interface DbSearchRow {
  slug: string;
  name: string;
}

/**
 * Shape of `db.execute(...)` return value. Neon's HTTP driver returns a
 * result object with a `rows` array. In practice drizzle surfaces this
 * slightly differently in dev vs. CI — both shapes are handled below.
 */
interface DbExecuteResult<T> {
  rows: T[];
}

/**
 * Search a single entity type using the database.
 *
 * Returns up to `limit` rows ordered by best-match-first rank. On any error
 * (DATABASE_URL missing, transient Neon failure, unexpected SQL exception)
 * returns an empty array — the endpoint continues to serve the other entity
 * types so a single bad query never blacks-out the full search.
 */
async function searchFromDb(entityType: EntityType, query: string, limit: number): Promise<SearchResult[]> {
  const config = ENTITY_CONFIG[entityType];

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch {
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const ilikePattern = `%${trimmed}%`;

  // `table`, `slugColumn`, `nameColumn` are trusted (defined in ENTITY_CONFIG
  // above). User-supplied values (`trimmed`, `ilikePattern`, `limit`) are
  // always bound via drizzle's parameterization.
  const tableRef = sql.raw(config.table);
  const slugRef = sql.raw(config.slugColumn);
  const nameRef = sql.raw(config.nameColumn);

  try {
    let result: DbExecuteResult<DbSearchRow>;

    if (config.hasSearchVector) {
      result = (await db.execute(sql`
        SELECT
          ${slugRef} AS slug,
          ${nameRef} AS name
        FROM ${tableRef}
        WHERE deleted_at IS NULL
          AND (
            search_vector @@ websearch_to_tsquery('english', ${trimmed})
            OR ${nameRef} ILIKE ${ilikePattern}
          )
        ORDER BY
          ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) DESC,
          ${nameRef} ASC
        LIMIT ${limit}
      `)) as unknown as DbExecuteResult<DbSearchRow>;
    } else {
      result = (await db.execute(sql`
        SELECT
          ${slugRef} AS slug,
          ${nameRef} AS name
        FROM ${tableRef}
        WHERE deleted_at IS NULL
          AND ${nameRef} ILIKE ${ilikePattern}
        ORDER BY ${nameRef} ASC
        LIMIT ${limit}
      `)) as unknown as DbExecuteResult<DbSearchRow>;
    }

    // Some drizzle driver adapters surface rows on `.rows`, others return
    // the array directly. Accept both.
    const rows: DbSearchRow[] = Array.isArray(result) ? (result as DbSearchRow[]) : (result.rows ?? []);

    return rows.map((r) => ({
      slug: String(r.slug),
      name: String(r.name),
      entityType,
      matchField: config.matchField,
    }));
  } catch (err) {
    // Log but don't throw — degrade gracefully so one failing type doesn't
    // wipe out the whole /search response.
    console.error(`[search] ${entityType} query failed:`, err);
    return [];
  }
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

  // Fan out per-type queries in parallel. Each hits a different table so
  // there's no contention, and the full 9-type sweep comfortably returns
  // in <500 ms against Neon HTTP.
  const settled = await Promise.all(entityTypes.map(async (t) => [t, await searchFromDb(t, query, limit)] as const));

  const results = new Map<EntityType, SearchResult[]>();
  for (const [entityType, rows] of settled) {
    results.set(entityType, rows);
  }

  return {
    results,
    source: "db",
  };
}
