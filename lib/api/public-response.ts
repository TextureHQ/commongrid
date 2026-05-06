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
 * Do NOT use these in auth-gated routes that legitimately need the internal
 * fields (e.g. `/mod/*`, `/me`, `/contributions/*`) — those should continue
 * to use `jsonResponse` / `paginatedResponse` directly.
 */
import { corsHeaders } from "./cors";
import { jsonResponse } from "./response";
import { INTERNAL_FIELDS } from "./internal-fields";

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
 * Build a `{ data: T }` public API response with internal fields stripped.
 *
 * @param data    - The resource (or null/undefined).
 * @param status  - HTTP status code (default 200).
 * @param headers - Additional headers to merge in (CORS already included).
 */
export function publicJsonResponse<T>(
  data: T,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  const sanitized = stripInternal(data);
  return jsonResponse({ data: sanitized }, status, { ...corsHeaders(), ...headers });
}

/**
 * Build a `{ data: T[], meta: … }` paginated public API response with
 * internal fields stripped from each item.
 */
export function publicPaginatedResponse<T>(
  data: T[],
  meta: Record<string, unknown>,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  const sanitized = data.map((item) => stripInternal(item));
  return jsonResponse({ data: sanitized, meta }, status, { ...corsHeaders(), ...headers });
}
