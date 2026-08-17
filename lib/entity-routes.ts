/**
 * entity_type -> public API segment.
 *
 * Three naming systems exist and none derives cleanly from another:
 *
 *   entity_type   `utility`      `power_plant`   `ev_station`
 *   API segment   `utilities`    `power-plants`  `ev-stations`
 *   UI route      `grid-operators`               `ev-charging`
 *
 * Naive pluralisation gets four of nine right — `utility` becomes `utilitys`,
 * and any multi-word type keeps its underscore — so callers building URLs by
 * appending "s" 404 on the rest. This is the one place the mapping lives.
 *
 * UI routes are deliberately absent: they are a navigation concern, and
 * conflating them with API paths is what produced the bug this replaces.
 */

/** Types with a `/versions` endpoint. Slug-keyed only. */
export const ENTITY_API_SEGMENTS: Record<string, string> = {
  utility: "utilities",
  power_plant: "power-plants",
  ev_station: "ev-stations",
  pricing_node: "pricing-nodes",
  iso: "isos",
  rto: "rtos",
  balancing_authority: "balancing-authorities",
  region: "regions",
  program: "programs",
};

/** Reverse of `ENTITY_API_SEGMENTS` — API path segment → entity_type. */
export const API_SEGMENT_TO_ENTITY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_API_SEGMENTS).map(([entityType, segment]) => [segment, entityType])
);

/**
 * API segment for an entity type, or null when the type has no public
 * slug-addressed endpoint — `territory` and `transmission_line` are keyed by
 * id, not slug.
 */
export function apiSegmentFor(entityType: string): string | null {
  return ENTITY_API_SEGMENTS[entityType] ?? null;
}

/** entity_type for a public API path segment, or null when unknown. */
export function entityTypeForApiSegment(segment: string): string | null {
  return API_SEGMENT_TO_ENTITY_TYPE[segment] ?? null;
}

/** Path to an entity's version history, or null if the type has no endpoint. */
export function versionsPath(entityType: string, slug: string): string | null {
  const segment = apiSegmentFor(entityType);
  return segment ? `/api/v1/${segment}/${encodeURIComponent(slug)}/versions` : null;
}
