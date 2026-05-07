/**
 * lib/api/internal-fields.ts
 *
 * Single source of truth for the list of schema fields that MUST NOT appear
 * in public API responses (and, by extension, the public OpenAPI spec).
 *
 * Consumed by:
 *   - `scripts/openapi/schema-from-drizzle.ts` → strips these from the spec
 *   - `lib/api/public-response.ts` → strips these from live API responses
 *
 * Keeping the list in one place ensures the spec and the live API never
 * drift in opposite directions (which was the bug that triggered this file:
 * the spec correctly omitted these fields, but the API still returned them).
 *
 * Why each field is internal:
 *
 *   submittedBy       — User identifier of the contributor who submitted a
 *                       change. Leaking this exposes a (non-public) user
 *                       mapping and has no value for API consumers.
 *
 *   reviewedBy        — Same reasoning: moderator user ID. Internal to the
 *                       moderation workflow, not data about the entity.
 *
 *   reviewedAt        — Timestamp a moderator approved the record. Useful
 *                       for moderation dashboards; noise for public consumers
 *                       and leaks moderator activity timing.
 *
 *   lockedStatus      — Internal flag used by the moderation UI to prevent
 *                       concurrent edits. Has no meaning outside the mod tool.
 *
 *   searchVector      — Raw Postgres `tsvector` serialization (e.g. "'duke':1
 *                       'energy':2 'carolinas':3"). Not useful data — it's
 *                       an index artifact. Exposing it implies it's part of
 *                       the schema, which it isn't.
 *
 *   notionPageId      — Historical field from a now-defunct Notion sync.
 *                       The column was dropped (ALL-735 / PR #209) and the
 *                       field was removed from `data/utilities.json` and
 *                       the Utility type (ALL-743). It's kept in this list
 *                       as a defensive safety-net: if a stale column,
 *                       legacy snapshot, or community fork still carries
 *                       the field, it will never leak through the public
 *                       API. Harmless no-op for current data.
 *
 * Geometry fields are also excluded from the default resource response —
 * geometry belongs on dedicated `/geometry` endpoints, not inline on every
 * list/detail row (they'd bloat the payload and trash caching).
 *
 *   geography         — PostGIS geography column (raw binary).
 *   geometry          — PostGIS geometry column (raw binary).
 *   simplified1km     — Precomputed simplified geometry for tile generation.
 *   centroid          — Precomputed centroid for tile generation.
 *   bbox              — Precomputed bounding box for tile generation.
 */

export const INTERNAL_FIELDS = new Set<string>([
  // Moderation / review workflow — never public.
  "submittedBy",
  "reviewedAt",
  "reviewedBy",
  "lockedStatus",

  // Index / storage artifacts — not useful public data.
  "searchVector",
  "notionPageId",

  // Geometry — served via dedicated /geometry endpoints, not inline.
  "geography",
  "geometry",
  "simplified1km",
  "centroid",
  "bbox",
]);
