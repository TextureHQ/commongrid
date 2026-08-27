/**
 * URL serialization for the explore route stack.
 *
 * Pure helpers, kept dependency-free so they can be unit-tested without
 * mounting the React provider or a DOM.
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

export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant";

export type ExploreViewMode = "map" | "table";

export interface ListRoutePayload {
  tab: EntityTab;
  q: string;
  segment: string;
  type: string;
  jurisdictions: string[];
  mode: ExploreViewMode;
}

export interface DetailRoutePayload {
  entityKind: EntityTab;
  slug: string;
}

export interface ExploreRouteDescriptor<T = undefined> {
  id: string;
  payload?: T;
}

export type ExploreRoute =
  | (ExploreRouteDescriptor & { type: "overview"; id: "overview" })
  | (ExploreRouteDescriptor<ListRoutePayload> & { type: "list"; id: string; payload: ListRoutePayload })
  | (ExploreRouteDescriptor<DetailRoutePayload> & { type: "detail"; id: string; payload: DetailRoutePayload });

const DEFAULT_TAB: EntityTab = "utilities";

const DEFAULT_FILTERS: Omit<ListRoutePayload, "tab" | "mode"> = {
  q: "",
  segment: "all",
  type: "all",
  jurisdictions: [],
};

export const DEFAULT_MODE_FOR_TAB: Record<EntityTab, ExploreViewMode> = {
  utilities: "table",
  "grid-operators": "table",
  programs: "table",
  rates: "table",
  "power-plants": "map",
  "transmission-lines": "map",
  "ev-charging": "map",
  "pricing-nodes": "map",
  substations: "map",
};

const VALID_TABS: ReadonlySet<EntityTab> = new Set([
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

export function parseTab(value: string | null): EntityTab {
  if (value && VALID_TABS.has(value as EntityTab)) return value as EntityTab;
  return DEFAULT_TAB;
}

export function parseViewMode(value: string | null | undefined): ExploreViewMode | null {
  return value === "map" || value === "table" ? value : null;
}

export function makeOverviewRoute(): ExploreRoute {
  return { type: "overview", id: "overview" };
}

export function makeListRoute(
  tab: EntityTab,
  mode?: ExploreViewMode,
  filters: Partial<Omit<ListRoutePayload, "tab" | "mode">> = {}
): ExploreRoute {
  return {
    type: "list",
    id: `list:${tab}`,
    payload: { tab, mode: mode ?? DEFAULT_MODE_FOR_TAB[tab], ...DEFAULT_FILTERS, ...filters },
  };
}

export function makeDetailRoute(entityKind: EntityTab, slug: string): ExploreRoute {
  return {
    type: "detail",
    id: `detail:${slug}`,
    payload: { entityKind, slug },
  };
}

/**
 * Parse URLSearchParams into a stack of explore routes.
 *
 * Overview is always the stack root — `/explore` (no params) lands on
 * overview, and back-from-list returns to it.
 *
 * - empty URL → `[overview]`
 * - `?tab=utilities` → `[overview, list(utilities)]`
 * - `?tab=utilities&slug=sunrise` → `[overview, list(utilities), detail(sunrise, utilities)]`
 * - `?tab=utilities&slug=mass-save&kind=programs` → `[overview, list(utilities), detail(mass-save, programs)]`
 *
 * Filter params (`q`, `segment`, `type`, `jurisdictions`) attach to the
 * current list route's payload. They survive the back-arrow popping a
 * detail route off, but are cleared when the user switches tabs (because
 * peer eviction replaces the list route with a fresh one).
 */
export function parseRoutes(params: URLSearchParams): ExploreRoute[] {
  // Backwards-compat for the old `view` param name.
  const tabParam = params.get("tab") ?? params.get("view");
  if (!tabParam) return [makeOverviewRoute()];

  const tab = parseTab(tabParam);

  // An explicit `?mode=` wins; otherwise the per-tab default applies. URL
  // entry points are the only place the per-tab default grammar belongs.
  const mode = parseViewMode(params.get("mode")) ?? DEFAULT_MODE_FOR_TAB[tab];

  const list = makeListRoute(tab, mode, {
    q: params.get("q") ?? "",
    segment: params.get("segment") ?? "all",
    type: params.get("type") ?? "all",
    jurisdictions: params.get("jurisdictions")?.split(",").filter(Boolean) ?? [],
  });

  const slug = params.get("slug");
  if (!slug) return [makeOverviewRoute(), list];

  const fromParam = params.get("from");
  const ancestorPairs =
    fromParam
      ?.split(",")
      .map((pair) => {
        const colonIndex = pair.indexOf(":");
        if (colonIndex <= 0 || colonIndex === pair.length - 1) return null;
        const ancestorKind = pair.slice(0, colonIndex);
        const ancestorSlug = pair.slice(colonIndex + 1);
        return { entityKind: parseTab(ancestorKind), slug: ancestorSlug };
      })
      .filter((p): p is { entityKind: EntityTab; slug: string } => p !== null) ?? [];

  // The top detail's entity kind defaults to the list tab, but an explicit
  // `kind` param lets a cross-entity detail (e.g. a program opened from a
  // utility detail) survive a URL round-trip.
  //
  // parseTab() never returns null (it falls back to DEFAULT_TAB), so a bare
  // `parseTab(params.get("kind")) ?? tab` silently resolved every kind-less
  // detail to "utilities" — clicking a program from the programs list opened
  // UtilityDetailPanel ("Utility not found") and the program territory never
  // loaded. Only consult `kind` when it is actually present; otherwise the
  // top detail belongs to the base list tab.
  const kindParam = params.get("kind");
  const topEntityKind = kindParam ? parseTab(kindParam) : tab;

  const routes: ExploreRoute[] = [makeOverviewRoute(), list];
  for (const ancestor of ancestorPairs) {
    routes.push(makeDetailRoute(ancestor.entityKind, ancestor.slug));
  }
  routes.push(makeDetailRoute(topEntityKind, slug));
  return routes;
}

/**
 * Serialize a stack of explore routes to URLSearchParams.
 *
 * Overview emits no params — `[overview]` serializes to an empty URL
 * so `/explore` stays clean as the landing state.
 */
export function serializeRoutes(routes: ExploreRoute[]): URLSearchParams {
  const params = new URLSearchParams();
  const list = routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
  const details = routes.filter((r): r is Extract<ExploreRoute, { type: "detail" }> => r.type === "detail");
  const detail = details.length > 0 ? details[details.length - 1] : null;

  if (list) {
    params.set("tab", list.payload.tab);
    if (list.payload.mode !== DEFAULT_MODE_FOR_TAB[list.payload.tab]) {
      params.set("mode", list.payload.mode);
    }
    if (list.payload.q) params.set("q", list.payload.q);
    if (list.payload.segment && list.payload.segment !== "all") params.set("segment", list.payload.segment);
    if (list.payload.type && list.payload.type !== "all") params.set("type", list.payload.type);
    if (list.payload.jurisdictions.length > 0) params.set("jurisdictions", list.payload.jurisdictions.join(","));
  }
  if (detail) {
    params.set("slug", detail.payload.slug);

    // When the top detail is a different entity kind than the base list tab,
    // emit an explicit `kind` param so parseRoutes can reconstruct it.
    if (list && detail.payload.entityKind !== list.payload.tab) {
      params.set("kind", detail.payload.entityKind);
    }

    const ancestors = details.slice(0, -1);
    if (ancestors.length > 0) {
      params.set("from", ancestors.map((d) => `${d.payload.entityKind}:${d.payload.slug}`).join(","));
    }
  }
  return params;
}
