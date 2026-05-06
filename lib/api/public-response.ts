/**
 * lib/api/public-response.ts
 *
 * Helpers for building CommonGrid *public* API responses. Use these in any
 * route that returns resource data (utilities, ISOs, power plants, etc.).
 *
 * They strip `INTERNAL_FIELDS` (see `lib/api/internal-fields.ts`) from every
 * object before serialization, so the public API response stays in lockstep
 * with what `scripts/generate-openapi.ts` emits.
 *
 * They also implement sparse-fieldset projection (JSON:API-style `?fields=`),
 * letting clients opt into a subset of the response shape. Combined with
 * internal-field stripping, this guarantees:
 *
 *   1. List and detail endpoints produce the same per-record shape.
 *   2. Numeric/valuable fields (customerCount, peakDemandMw, etc.) are never
 *      hard-nulled by the serializer — they're always either present or
 *      deliberately projected away by `?fields=`.
 *   3. A client can never resurrect an internal field by asking for it —
 *      stripping happens BEFORE projection.
 *
 * Do NOT use these in auth-gated routes that legitimately need the internal
 * fields (e.g. `/mod/*`, `/me`, `/contributions/*`) — those should continue
 * to use `jsonResponse` / `paginatedResponse` directly.
 */
import { corsHeaders } from "./cors";
import { INTERNAL_FIELDS } from "./internal-fields";
import { jsonResponse } from "./response";

/**
 * Remove internal fields from an object in-place-safe fashion. Returns a new
 * object with `INTERNAL_FIELDS` keys omitted. Non-objects are returned as-is.
 *
 * Shallow by default. If `deep` is true, recurses into plain-object values
 * and array items (useful for responses that embed related resources via
 * `?include=` options, e.g. `{ ..., _iso: { …full ISO row… } }`).
 */
export function stripInternal<T>(input: T, deep = true): T {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map((item) => stripInternal(item, deep)) as unknown as T;
  }

  if (typeof input !== "object") return input;

  // Skip non-plain objects (Date, Buffer, etc.) — nothing to strip and
  // recursing would break them.
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (INTERNAL_FIELDS.has(key)) continue;
    out[key] = deep ? stripInternal(value, true) : value;
  }
  return out as unknown as T;
}

/**
 * Parse a `?fields=` query parameter value into a trimmed, de-duped list of
 * field names.
 *
 * Accepts:
 *   - `null` / `undefined` → returns `null` (no projection)
 *   - empty / whitespace-only string → returns `null`
 *   - comma-separated string → returns the non-empty, trimmed field names
 *
 * We intentionally do NOT validate field names against a per-entity allow
 * list here: `selectFields` only copies keys that exist on the source
 * object, so unknown field names are silently dropped. This mirrors the
 * JSON:API sparse-fieldset convention and avoids coupling the serializer
 * to every entity schema.
 */
export function parseFieldsParam(raw: string | null | undefined): string[] | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  if (parts.length === 0) return null;
  // De-dupe while preserving first-seen order.
  return Array.from(new Set(parts));
}

/**
 * Return a shallow copy of `input` containing only the keys listed in
 * `fields`. Missing keys are silently skipped (not set to null) so the
 * response shape reflects exactly what the client asked for, and zero/null
 * values are preserved (not confused with "missing").
 *
 * Non-plain objects (null, arrays, primitives) are returned unchanged.
 */
export function selectFields<T>(input: T, fields: string[]): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input) || typeof input !== "object") return input;

  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn not available in current ES target
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      out[field] = source[field];
    }
  }
  return out as unknown as T;
}

/**
 * Normalize a `fields` option that can be either a pre-parsed array, a raw
 * `?fields=...` string, or null/undefined.
 */
function resolveFields(fields: string[] | string | null | undefined): string[] | null {
  if (fields == null) return null;
  if (typeof fields === "string") return parseFieldsParam(fields);
  return fields.length > 0 ? fields : null;
}

/**
 * Build a `{ data: T }` public API response with internal fields stripped
 * and optional sparse-fieldset projection applied.
 *
 * @param data    - The resource (or null/undefined).
 * @param status  - HTTP status code (default 200).
 * @param headers - Additional headers to merge in (CORS already included).
 * @param options - `fields`: JSON:API-style sparse fieldset. Accepts either
 *                  a pre-parsed `string[]` or the raw `?fields=` string.
 *                  Projection runs AFTER internal-field stripping, so
 *                  internal fields can never be resurrected via `?fields=`.
 */
export function publicJsonResponse<T>(
  data: T,
  status: number = 200,
  headers: Record<string, string> = {},
  options: { fields?: string[] | string | null } = {}
): Response {
  const sanitized = stripInternal(data);
  const fields = resolveFields(options.fields);
  const projected = fields ? selectFields(sanitized, fields) : sanitized;
  return jsonResponse({ data: projected }, status, { ...corsHeaders(), ...headers });
}

/**
 * Build a `{ data: T[], meta: … }` paginated public API response with
 * internal fields stripped from each item and optional sparse-fieldset
 * projection applied per-item.
 */
export function publicPaginatedResponse<T>(
  data: T[],
  meta: Record<string, unknown>,
  status: number = 200,
  headers: Record<string, string> = {},
  options: { fields?: string[] | string | null } = {}
): Response {
  const fields = resolveFields(options.fields);
  const sanitized = data.map((item) => {
    const stripped = stripInternal(item);
    return fields ? selectFields(stripped, fields) : stripped;
  });
  return jsonResponse({ data: sanitized, meta }, status, { ...corsHeaders(), ...headers });
}
