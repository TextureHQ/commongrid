/**
 * Region-selector → navigation resolution for the explore map.
 *
 * The map's region dropdown (Utilities / Grid operators / Programs / Rates /
 * Pricing nodes) picks which fill/territory layer the map renders. Changing
 * it is a *navigation*: it must push a list route onto the URL-backed route
 * stack, exactly like tapping a bucket tile in the overview panel.
 *
 * This existed as a bug (CG-259): the dropdown's handler only mutated the
 * view-state `listSource` via `setListSource`, which does not touch the route
 * stack or the URL. The ExplorerContext then runs a mirror effect that snaps
 * `view.listSource` back to the current route's `tab`, so:
 *   - on a list route, the pick flickered and immediately reverted; and
 *   - on the overview root (no list route), nothing navigated at all —
 *     the user saw only a "refresh".
 * Routing the change through `navigateToTab` (URL/route-stack driven) fixes
 * both, and carries the current map/table projection so the map stays a map.
 *
 * This module is intentionally dependency-free (no React, no edges route
 * stack, no DOM) so the region→tab contract can be unit-tested directly.
 */

/**
 * Regions that the map's fill layer can render. This is the subset of entity
 * tabs that own a territory/fill layer, and mirrors `MapRegion` in
 * `components/explorer/ExplorerMap.tsx`.
 */
export type MapRegion = "utilities" | "grid-operators" | "programs" | "rates" | "pricing-nodes";

/**
 * The list tab a region maps to. Regions are already a subset of the entity
 * tab space and share the same string identifiers, so this is an identity
 * mapping — but naming it makes the region→tab navigation contract explicit
 * and gives the regression test a single seam to assert against.
 */
export type RegionTab = MapRegion;

export const MAP_REGIONS: readonly MapRegion[] = ["utilities", "grid-operators", "programs", "rates", "pricing-nodes"];

/** Whether a string is a valid, navigable map region. */
export function isMapRegion(value: string): value is MapRegion {
  return (MAP_REGIONS as readonly string[]).includes(value);
}

/**
 * Resolve the list tab to navigate to when a region is selected.
 *
 * Selecting a region must always resolve to a concrete navigable tab so the
 * caller (`navigateToTab`) rebuilds the route stack and URL. Region ids are
 * tab ids, so this is the identity — but the explicit function is the anchor
 * that keeps the dropdown wired to real navigation instead of a view-state
 * mutation that the context mirror effect silently reverts (CG-259).
 */
export function regionToTab(region: MapRegion): RegionTab {
  return region;
}
