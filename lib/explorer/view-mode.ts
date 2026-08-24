/**
 * Projection ("map" vs "table") resolution for the explore surface.
 *
 * These are pure functions so the rules can be tested without mounting the
 * provider. They exist because the projection has three distinct callers
 * with three different correct answers, and collapsing them onto one
 * `DEFAULT_MODE_FOR_TAB` lookup produced two user-visible bugs:
 *
 *  1. `/explore` (no params) rendered a bare utilities table instead of the
 *     map, because the overview root has no list route and the fallback
 *     resolved to `DEFAULT_MODE_FOR_TAB["utilities"]` === "table".
 *  2. Clicking a bucket in the map's overview panel (utilities, grid
 *     operators, programs, rates) threw the user out of the map into a
 *     full-page table, because the tab switch re-derived the projection
 *     from the per-tab default instead of carrying the current one.
 *
 * The per-tab defaults still govern URL entry points (the homepage's nine
 * `?view=...&mode=...` links, and any hand-typed `?view=` without `?mode=`),
 * which is the only place that grammar belongs.
 */

export type ExploreViewMode = "map" | "table";

/**
 * The projection to render, given the active list route's mode (or `null`
 * when the stack is sitting on the overview root).
 *
 * Overview *is* the map surface — the bucket list renders inside the map's
 * right-edge panel — so a paramless `/explore` resolves to "map".
 */
export function resolveViewMode(activeListMode: ExploreViewMode | null | undefined): ExploreViewMode {
  return activeListMode ?? "map";
}

/**
 * The projection a tab switch should land in. Switching layers is a change
 * of *subject*, not a change of *projection*: a user reading the map who
 * opens Utilities expects utilities on the map.
 */
export function carryViewMode(activeListMode: ExploreViewMode | null | undefined): ExploreViewMode {
  return activeListMode ?? "map";
}

/**
 * Whether an explicit `?mode=` param should override the per-tab default.
 * Anything other than the two valid literals is ignored rather than
 * treated as "table".
 */
export function parseViewMode(value: string | null | undefined): ExploreViewMode | null {
  return value === "map" || value === "table" ? value : null;
}

/**
 * What the Map/Table toggle should do to the route stack.
 *
 * Splitting this out keeps the "toggle is inert on overview" bug from
 * coming back: the toggle previously early-returned whenever there was no
 * list route to rewrite, which is exactly the `/explore` landing state, so
 * both buttons did nothing at all.
 *
 *  - `"noop"`          — already showing that projection.
 *  - `"open-list"`     — no list route yet; open one in the requested mode.
 *  - `"reproject"`     — rewrite the existing list route's mode in place.
 */
export type ViewModeToggleAction = "noop" | "open-list" | "reproject";

export function viewModeToggleAction(
  requested: ExploreViewMode,
  activeListMode: ExploreViewMode | null | undefined
): ViewModeToggleAction {
  // No list route means the stack is on the overview root, which already
  // renders on the map surface. "Map" is therefore a no-op; "Table" has to
  // open a list route because there is nothing to reproject.
  if (activeListMode == null) {
    return requested === "table" ? "open-list" : "noop";
  }
  return requested === activeListMode ? "noop" : "reproject";
}
