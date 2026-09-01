/**
 * Legacy `/explore` query-param URL → path-based URL redirect mapping (CG-261).
 *
 * Before CG-252 the explore surface encoded navigation in query params:
 *   /explore?view=<tab>&tab=<tab>&slug=<slug>&mode=<map|table>&q=<query>
 * As of CG-252 (PR #430) navigation lives in the URL *path* and query params
 * carry view options only. Old bookmarks and inbound links still hit the
 * query-param form, so we permanently (308) redirect them to the canonical
 * path form.
 *
 * Pure and framework-free (same pattern as `explore-path.ts`) so the mapping
 * is unit-tested without the router or middleware.
 *
 * Grammar produced (matches lib/explorer/explore-path.ts):
 *   ?view/tab=<t>            → /explore/<t>
 *   ?view/tab=<t>&slug=<s>   → /explore/<t>/<s>
 *   &mode=map                → dropped (map is the default everywhere)
 *   &mode=table              → preserved as ?mode=table
 *   &q / &segment / &type / &jurisdictions → preserved as list view options
 *
 * Known lossy case (by design): the old scheme could not express the
 * utility→program nesting — `?tab=utilities&slug=<programSlug>` carried no
 * signal that the slug was a program. There is no reliable way to recover the
 * parent utility from a legacy URL, so a program is redirected to its *direct*
 * view (`/explore/programs/<slug>`). Since the caller only knows the slug and
 * the (possibly wrong) tab, this function trusts the `tab` it is given; the
 * middleware wiring documents that legacy links are inherently best-effort.
 */

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

const VALID_TABS: ReadonlySet<EntityTab> = new Set<EntityTab>([
  "utilities",
  "grid-operators",
  "power-plants",
  "programs",
  "rates",
  "transmission-lines",
  "ev-charging",
  "pricing-nodes",
  "substations",
]);

/**
 * Legacy grid-operator detail views were addressed as `view=iso|rto|ba`; they
 * all resolve to the single `grid-operators` tab in the new grammar.
 */
const LEGACY_VIEW_ALIASES: Record<string, EntityTab> = {
  iso: "grid-operators",
  rto: "grid-operators",
  ba: "grid-operators",
};

const EXPLORE_BASE_PATH = "/explore";

/** View-option query keys that carry over verbatim to the new URL. */
const PRESERVED_QUERY_KEYS = ["q", "segment", "type", "jurisdictions"] as const;

function resolveTab(raw: string | null): EntityTab | null {
  if (!raw) return null;
  if (VALID_TABS.has(raw as EntityTab)) return raw as EntityTab;
  return LEGACY_VIEW_ALIASES[raw] ?? null;
}

/**
 * Compute the canonical path-based redirect for a legacy explore URL, or
 * `null` when the request is already canonical / has nothing to migrate (so
 * the middleware can skip it and avoid redirect loops).
 *
 * Only `/explore` (the old single entry point) is ever rewritten; the new
 * `/explore/<...>` path routes are left untouched.
 */
export function legacyExploreRedirect(pathname: string, params: URLSearchParams): string | null {
  // Only the old flat entry point carried query-param navigation. New path
  // routes must never be rewritten (that would loop).
  if (pathname !== EXPLORE_BASE_PATH && pathname !== `${EXPLORE_BASE_PATH}/`) return null;

  const tab = resolveTab(params.get("view") ?? params.get("tab"));

  // No recognizable legacy navigation param. If there are also no stray
  // legacy-only keys to strip, leave it alone.
  if (!tab) {
    // A bare `/explore` (or with only preserved view options) is already
    // canonical — nothing to migrate.
    return null;
  }

  const slug = params.get("slug")?.trim() || null;

  // Build the path.
  let path = `${EXPLORE_BASE_PATH}/${tab}`;
  if (slug) path += `/${encodeURIComponent(slug)}`;

  // Rebuild the query with view options only.
  const next = new URLSearchParams();
  // mode: drop `map` (default), preserve `table`.
  if (params.get("mode") === "table") next.set("mode", "table");
  for (const key of PRESERVED_QUERY_KEYS) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }

  const query = next.toString();
  const target = query ? `${path}?${query}` : path;

  // If the redirect target equals the incoming request, skip (defensive; the
  // pathname guard above already prevents this for path routes).
  const incoming = params.toString() ? `${pathname}?${params.toString()}` : pathname;
  if (target === incoming) return null;

  return target;
}
