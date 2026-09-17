/**
 * One place that turns an entity reference into a link to its detail page.
 *
 * Two surfaces need this and used to answer differently. The changelog feed
 * renders rows in the browser, while `/api/v1/changelog/batches/:id` builds
 * hrefs for the breakout on the server — and their two private mappings
 * disagreed on both the keys and the destinations:
 *
 *   - The client switch matched `"balancing-authority"`; `entity_versions`
 *     stores `balancing_authority`. Nothing ever matched, so BA rows rendered
 *     as plain text.
 *   - The server map sent `utility` to `/utilities/:slug`, `iso` to
 *     `/isos/:slug`, and `program` to `/programs/:slug`. None of those three
 *     routes exist, so every one of those links 404'd.
 *
 * `entity_type` is free text in the database (see lib/db/schema/entity-versions.ts)
 * and is written in snake_case by the sync jobs, while `types/changelog.ts`
 * spells the same concepts in kebab-case. Both spellings are accepted here so
 * a caller never has to know which side of that fence its value came from.
 */

/**
 * Where each entity kind's detail page actually lives, verified against
 * `app/(shell)/*` rather than inferred from the type name.
 *
 * `null` means the kind has no slug-addressable detail page — territories and
 * regions are map geometry with no page of their own. Linking them anywhere
 * would 404, so callers render them as plain text instead.
 */
const DETAIL_PATH: Record<string, string | null> = {
  // Utilities are the only kind `/grid-operators/[slug]` resolves: the page
  // calls useUtility(params.slug) and 404s when that misses.
  utility: "/grid-operators",

  // ISOs and RTOs are grid operators too, but they render inside Explore.
  // `/grid-operators/pjm` 404s; `/explore/grid-operators/pjm` is the live page.
  iso: "/explore/grid-operators",
  rto: "/explore/grid-operators",

  // Balancing authorities have their own standalone route.
  balancing_authority: "/balancing-authorities",

  power_plant: "/power-plants",
  ev_station: "/ev-charging",
  pricing_node: "/pricing-nodes",
  substation: "/substations",

  // Programs live in Explore; `/programs/[slug]` has never existed.
  program: "/explore/programs",

  // Keyed on the HIFLD line id, not a slug — see resolveEntityHref.
  transmission_line: "/transmission-lines",

  // Geometry, not a destination.
  territory: null,
  region: null,
};

/** kebab-case spellings used by `types/changelog.ts` → the snake_case key above. */
const KIND_ALIASES: Record<string, string> = {
  "balancing-authority": "balancing_authority",
  "power-plant": "power_plant",
  "ev-station": "ev_station",
  "pricing-node": "pricing_node",
  "transmission-line": "transmission_line",
  // The entity catalog calls a balancing authority "ba".
  ba: "balancing_authority",
};

/** Normalize either spelling of an entity kind to the key `DETAIL_PATH` uses. */
export function normalizeEntityKind(entityType: string): string {
  const lower = entityType.toLowerCase();
  return KIND_ALIASES[lower] ?? lower;
}

/**
 * The detail-page href for one entity, or `null` when it has no linkable page.
 *
 * Returns `null` — rather than a best-guess path — for an unknown kind, a kind
 * with no detail route, or a missing identifier. A plain-text name is a much
 * better outcome than a link that 404s, and dead links are the exact failure
 * this module exists to prevent.
 */
export function resolveEntityHref(entityType: string, identifier: string | null | undefined): string | null {
  if (!identifier) return null;

  const kind = normalizeEntityKind(entityType);
  // `in` rather than a truthy check: a kind mapped to null is known-unlinkable,
  // which is a different fact from a kind we've never heard of.
  if (!(kind in DETAIL_PATH)) return null;

  const base = DETAIL_PATH[kind];
  if (!base) return null;

  return `${base}/${encodeURIComponent(identifier)}`;
}
