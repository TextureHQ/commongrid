/**
 * Convert a Drizzle table into an OpenAPI 3.1 schema object.
 *
 * Default behavior:
 *   - Introspects columns via drizzle-orm's `getTableColumns()`.
 *   - Maps Postgres column types to JSON schema types.
 *   - Strips internal / non-public fields by default (see `INTERNAL_FIELDS`).
 *   - Emits `nullable: true` for columns that aren't `notNull`.
 *   - Optionally emits a `description` from an override map.
 *
 * Options let callers:
 *   - keep selected internal fields (e.g. `geometry` on geometry-endpoint responses);
 *   - strip additional fields (e.g. omit jsonb blob on list endpoints);
 *   - provide field descriptions for richer documentation.
 */

import { getTableColumns } from "drizzle-orm";

// biome-ignore lint/suspicious/noExplicitAny: Drizzle column introspection is too generic to usefully type here
type DrizzleColumn = any;
// biome-ignore lint/suspicious/noExplicitAny: accepts any pg-core table
type DrizzleTable = any;

export type JsonSchema = Record<string, unknown>;

/**
 * Fields that are never part of a public API response and are always stripped.
 *
 * These are internal / moderation / search-index fields. `geography` and
 * `geometry` are stripped here as well — callers that want geometry on a
 * geometry-specific endpoint should compose the response schema separately
 * (the geometry endpoints return `{ data: GeoJSON }`, not the raw row).
 */
export const INTERNAL_FIELDS = new Set<string>([
  "submittedBy",
  "reviewedAt",
  "reviewedBy",
  "lockedStatus",
  "searchVector",
  "notionPageId",
  "geography",
  "geometry",
  "simplified1km",
  "centroid",
  "bbox",
]);

export interface SchemaOptions {
  /** Fields to exclude in addition to the default internal set. */
  stripAdditional?: string[];
  /** Fields to keep even if they're in the INTERNAL_FIELDS set. */
  keepInternal?: string[];
  /** Per-field descriptions. Keys are camelCase field names. */
  descriptions?: Record<string, string>;
  /** Only include these fields (allowlist). Runs after strip logic. */
  onlyFields?: string[];
  /**
   * Override the JSON-schema type for specific fields. Useful for jsonb
   * columns where we know the shape (e.g. `states: string[]`).
   */
  fieldOverrides?: Record<string, JsonSchema>;
}

/**
 * Map a Drizzle column to a JSON-schema snippet (no nullable, no description).
 */
function columnToJsonSchema(col: DrizzleColumn): JsonSchema {
  const columnType = col.columnType as string;
  const dataType = col.dataType as string;

  // Arrays (Postgres text[], etc.)
  if (columnType === "PgArray") {
    const baseSchema = col.baseColumn ? columnToJsonSchema(col.baseColumn) : { type: "string" };
    return { type: "array", items: baseSchema };
  }

  // Custom columns (tsvector, geography, geometry, box2d) — surface as string
  // by default. Callers should generally strip these anyway; this is a safety
  // net for anything not in INTERNAL_FIELDS.
  if (columnType === "PgCustomColumn") {
    return { type: "string" };
  }

  switch (columnType) {
    case "PgText":
    case "PgVarchar":
    case "PgChar":
    case "PgUUID":
      return { type: "string" };
    case "PgInteger":
    case "PgSmallInt":
    case "PgBigInt":
    case "PgSerial":
    case "PgBigSerial":
      return { type: "integer" };
    case "PgNumeric":
    case "PgDoublePrecision":
    case "PgReal":
      return { type: "number" };
    case "PgBoolean":
      return { type: "boolean" };
    case "PgTimestamp":
    case "PgTimestampString":
    case "PgDate":
    case "PgDateString":
      return { type: "string", format: "date-time" };
    case "PgJson":
    case "PgJsonb":
      // Unknown shape — permissive. Field overrides should replace this
      // for known-shape jsonb columns.
      return {};
    default:
      // Fall back on dataType
      if (dataType === "string") return { type: "string" };
      if (dataType === "number") return { type: "number" };
      if (dataType === "boolean") return { type: "boolean" };
      if (dataType === "date") return { type: "string", format: "date-time" };
      return {};
  }
}

/**
 * Produce an OpenAPI schema object for a Drizzle table.
 */
export function tableToSchema(table: DrizzleTable, opts: SchemaOptions = {}): JsonSchema {
  const columns = getTableColumns(table);
  const strip = new Set<string>(opts.stripAdditional ?? []);
  const keep = new Set<string>(opts.keepInternal ?? []);
  const only = opts.onlyFields ? new Set(opts.onlyFields) : null;
  const descriptions = opts.descriptions ?? {};
  const fieldOverrides = opts.fieldOverrides ?? {};

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [fieldName, col] of Object.entries(columns)) {
    if (only && !only.has(fieldName)) continue;
    if (strip.has(fieldName)) continue;
    if (INTERNAL_FIELDS.has(fieldName) && !keep.has(fieldName)) continue;

    const override = fieldOverrides[fieldName];
    const base: JsonSchema = override ? { ...override } : columnToJsonSchema(col as DrizzleColumn);

    // Nullable (OpenAPI 3.1-compatible — we emit `nullable: true` for
    // compatibility with most tooling that still relies on the OAS 3.0 key.
    // 3.1 prefers `type: [X, "null"]` but Redocly + Swagger UI accept both.)
    const notNull = (col as DrizzleColumn).notNull as boolean;
    const hasDefault = (col as DrizzleColumn).hasDefault as boolean;

    if (!notNull) {
      base.nullable = true;
    }
    // Required: only include when notNull AND no default (default means it
    // can be server-populated, though returned rows always have a value —
    // so from a response-schema POV, required = notNull is reasonable).
    if (notNull) {
      required.push(fieldName);
    }

    const desc = descriptions[fieldName];
    if (desc) {
      base.description = desc;
    }

    properties[fieldName] = base;

    // Unused: the `hasDefault` flag (kept in case we differentiate request
    // vs response schemas in the future).
    void hasDefault;
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
