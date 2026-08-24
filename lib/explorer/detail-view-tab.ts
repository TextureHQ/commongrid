/**
 * Pure mapping from a detail entity view to the list tab that owns it.
 *
 * The explorer route stack keys the rendered detail panel and the URL's
 * `tab` param off the *tab*, not off the detail entity type. Cross-entity
 * links (e.g. a program's administrator utility, or a utility's programs)
 * must therefore resolve the destination entity's tab explicitly — otherwise
 * they inherit the source tab and render the wrong panel ("Program not
 * found" when a utility slug is opened under `tab=programs`).
 *
 * Grid operators (iso / rto / ba) all live under the single
 * "grid-operators" tab.
 *
 * Kept in its own dependency-free module so it can be unit-tested without the
 * React hook, the edges route stack, or a DOM.
 */

export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant" | "rates";

export type EntityTab =
  | "utilities"
  | "grid-operators"
  | "power-plants"
  | "programs"
  | "rates"
  | "transmission-lines"
  | "ev-charging"
  | "pricing-nodes"
  | "substations";

export const DETAIL_VIEW_TO_TAB: Record<DetailView, EntityTab> = {
  utility: "utilities",
  program: "programs",
  "power-plant": "power-plants",
  rates: "rates",
  iso: "grid-operators",
  rto: "grid-operators",
  ba: "grid-operators",
};

/** Resolve the list tab that owns a given detail entity view. */
export function detailViewToTab(view: DetailView): EntityTab {
  return DETAIL_VIEW_TO_TAB[view];
}
