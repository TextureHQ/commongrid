"use client";

import {
  type ExploreRouteDescriptor,
  type UrlExploreRouteStackController,
  useUrlExploreRouteStack,
} from "@texturehq/edges-explore";
import type { FeatureCollection } from "geojson";
import { useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { detailViewToTab } from "@/lib/explorer/detail-view-tab";
import {
  carryViewMode,
  type ExploreViewMode,
  parseViewMode,
  resolveViewMode,
  viewModeToggleAction,
} from "@/lib/explorer/view-mode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
export type { ExploreViewMode };
export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant";

/**
 * Route shape for CommonGrid's explore stack.
 *
 * A `list` route owns its filter state in `payload`. Mutating a filter on
 * the active list route is a `stack.replace(routeWithUpdatedFilter)` call —
 * which both updates the in-memory stack and re-serializes to the URL.
 * Switching tabs (push of a different list peer) evicts the prior list
 * peer and its filter state — matching the existing behavior where
 * tab switches clear filters.
 *
 * A `detail` route only carries the entity slug. `entityKind` records which
 * tab context the user was in when they drilled in, so the back-arrow returns
 * them to the right list view.
 */
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

function makeOverviewRoute(): ExploreRoute {
  return { type: "overview", id: "overview" };
}

function makeListRoute(
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

function makeDetailRoute(entityKind: EntityTab, slug: string): ExploreRoute {
  return {
    type: "detail",
    id: `detail:${slug}`,
    payload: { entityKind, slug },
  };
}

// ---------------------------------------------------------------------------
// URL ↔ stack serialization
// ---------------------------------------------------------------------------

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

function parseTab(value: string | null): EntityTab {
  if (value && VALID_TABS.has(value as EntityTab)) return value as EntityTab;
  return DEFAULT_TAB;
}

/**
 * Parse URLSearchParams into a stack of explore routes.
 *
 * Overview is always the stack root — `/explore` (no params) lands on
 * overview, and back-from-list returns to it.
 *
 * - empty URL → `[overview]`
 * - `?tab=utilities` → `[overview, list(utilities)]`
 * - `?tab=plants&slug=sunrise` → `[overview, list(plants), detail(sunrise, plants)]`
 *
 * Filter params (`q`, `segment`, `type`, `jurisdictions`) attach to the
 * current list route's payload. They survive the back-arrow popping a
 * detail route off, but are cleared when the user switches tabs (because
 * peer eviction replaces the list route with a fresh one).
 */
function parseRoutes(params: URLSearchParams): ExploreRoute[] {
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
  return [makeOverviewRoute(), list, makeDetailRoute(tab, slug)];
}

function serializeRoutes(routes: ExploreRoute[]): URLSearchParams {
  // Overview emits no params — `[overview]` serializes to an empty URL
  // so `/explore` stays clean as the landing state.
  const params = new URLSearchParams();
  const list = routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
  const detail = routes.find((r): r is Extract<ExploreRoute, { type: "detail" }> => r.type === "detail");

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
  }
  return params;
}

// ---------------------------------------------------------------------------
// View-only reducer (everything orthogonal to the route stack)
// ---------------------------------------------------------------------------

interface ViewState {
  listSource: EntityTab;
  highlightGeoJSON: FeatureCollection | null;
  hoveredSlug: string | null;
  filteredUtilitySlugs: string[] | null;
}

type ViewAction =
  | { type: "SET_LIST_SOURCE"; listSource: EntityTab }
  | { type: "SET_HIGHLIGHT"; geoJSON: FeatureCollection | null }
  | { type: "SET_HOVERED_SLUG"; slug: string | null }
  | { type: "SET_FILTERED_UTILITY_SLUGS"; slugs: string[] | null };

const INITIAL_VIEW_STATE: ViewState = {
  listSource: DEFAULT_TAB,
  highlightGeoJSON: null,
  hoveredSlug: null,
  filteredUtilitySlugs: null,
};

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "SET_LIST_SOURCE":
      return { ...state, listSource: action.listSource };
    case "SET_HIGHLIGHT":
      return { ...state, highlightGeoJSON: action.geoJSON };
    case "SET_HOVERED_SLUG":
      return { ...state, hoveredSlug: action.slug };
    case "SET_FILTERED_UTILITY_SLUGS":
      return { ...state, filteredUtilitySlugs: action.slugs };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Combined state surface (preserves the existing useExplorer() API shape)
// ---------------------------------------------------------------------------

/**
 * Derived state mirrored from the route stack onto the existing `state.*`
 * shape, so panels using `useExplorer().state.tab` / `state.slug` /
 * `state.mode` etc. keep working unchanged.
 */
export interface ExplorerState {
  tab: EntityTab;
  listSource: EntityTab;
  mode: "overview" | "list" | "detail";
  viewMode: ExploreViewMode;
  slug: string | null;
  q: string;
  segment: string;
  type: string;
  jurisdictions: string[];
  highlightGeoJSON: FeatureCollection | null;
  hoveredSlug: string | null;
  filteredUtilitySlugs: string[] | null;
}

interface ExplorerContextValue {
  state: ExplorerState;
  stack: UrlExploreRouteStackController<ExploreRoute>;
  navigateToTab: (tab: EntityTab) => void;
  navigateToOverview: () => void;
  navigateToDetail: (view: DetailView, slug: string) => void;
  setListSource: (listSource: EntityTab) => void;
  setFilters: (patch: Partial<Omit<ListRoutePayload, "tab">>) => void;
  setSearch: (q: string) => void;
  setSegment: (segment: string) => void;
  setTypeFilter: (type: string) => void;
  setJurisdictions: (jurisdictions: string[]) => void;
  setHighlight: (geoJSON: FeatureCollection | null) => void;
  setHoveredSlug: (slug: string | null) => void;
  setFilteredUtilitySlugs: (slugs: string[] | null) => void;
  goBack: () => void;
  setViewMode: (mode: ExploreViewMode) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ExplorerCtx = createContext<ExplorerContextValue | null>(null);

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerCtx);
  if (!ctx) throw new Error("useExplorer must be used within ExplorerProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ExplorerProviderProps {
  children: ReactNode;
}

/**
 * The active layer (`?view=`/`?tab=`) and projection (`?mode=`) are derived
 * from the URL by `parseRoutes`, so they are intentionally NOT accepted as
 * props here — a second source of truth would drift from the route stack.
 */
export function ExplorerProvider({ children }: ExplorerProviderProps) {
  const searchParams = useSearchParams();
  const [view, dispatch] = useReducer(viewReducer, INITIAL_VIEW_STATE);

  const stack = useUrlExploreRouteStack<ExploreRoute>({
    parse: parseRoutes,
    serialize: serializeRoutes,
    initialSearch: searchParams?.toString(),
    getRouteKey: (route) => route.id,
  });

  // Track the last search string we synced to the URL to avoid loops.
  const lastSyncedSearch = useRef(stack.serializedSearch);

  // Stack → URL sync. Use raw history.replaceState to avoid triggering
  // Next.js routing machinery (router.replace causes re-renders that can
  // create feedback loops with useSearchParams / initialSearch serialization).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = stack.serializedSearch;
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
      lastSyncedSearch.current = next;
    }
  }, [stack.serializedSearch]);

  // URL → Stack sync for in-app navigations.
  // Next's router.push updates searchParams but doesn't fire popstate, so
  // useUrlExploreRouteStack misses it. If the URL changes externally (e.g.
  // clicking a global search result while already on /explore), we need to
  // re-parse and reset the stack here.
  useEffect(() => {
    const currentSearch = searchParams?.toString() ?? "";

    // Ignore changes if the URL matches what we just wrote, or if it
    // matches the current stack (no-op).
    if (currentSearch === lastSyncedSearch.current || currentSearch === stack.serializedSearch) {
      return;
    }

    // Parse the new incoming URL.
    const incomingParams = new URLSearchParams(currentSearch);
    const newRoutes = parseRoutes(incomingParams);

    // Check if adopting this URL would actually change our serialized state.
    // This prevents ping-pong loops if parse+serialize isn't perfectly idempotent.
    const newSerialized = serializeRoutes(newRoutes).toString();
    if (newSerialized === stack.serializedSearch) {
      lastSyncedSearch.current = currentSearch;
      return;
    }

    // The URL changed externally. Rebuild the stack to match.
    // Close clears the stack, then we push the new routes in order.
    stack.close();
    let newTab: EntityTab | null = null;
    for (const route of newRoutes) {
      stack.push(route);
      if (route.type === "list") {
        newTab = route.payload.tab;
      }
    }
    if (newTab) {
      dispatch({ type: "SET_LIST_SOURCE", listSource: newTab });
    }
    lastSyncedSearch.current = currentSearch;
  }, [searchParams, stack]);

  // Derive the legacy ExplorerState shape from the stack + view state so
  // consuming panels continue to read `state.tab`, `state.slug`, etc.
  const state = useMemo<ExplorerState>(() => {
    const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
    const tab = currentList?.payload.tab ?? DEFAULT_TAB;
    const filters = currentList?.payload ?? {
      q: "",
      segment: "all",
      type: "all",
      jurisdictions: [],
      tab: DEFAULT_TAB,
      mode: DEFAULT_MODE_FOR_TAB[DEFAULT_TAB],
    };
    const detail = stack.current?.type === "detail" ? stack.current : null;
    const current = stack.current;
    const mode: ExplorerState["mode"] = detail ? "detail" : current?.type === "overview" ? "overview" : "list";
    // The overview root has no list route, so it has no per-layer projection
    // of its own. See lib/explorer/view-mode.ts for why this is not simply
    // DEFAULT_MODE_FOR_TAB[DEFAULT_TAB] (which would render the map surface
    // as a bare utilities table on a paramless /explore).
    const viewMode = resolveViewMode(currentList?.payload.mode);
    return {
      tab,
      listSource: view.listSource,
      mode,
      viewMode,
      slug: detail?.payload.slug ?? null,
      q: filters.q,
      segment: filters.segment,
      type: filters.type,
      jurisdictions: filters.jurisdictions,
      highlightGeoJSON: view.highlightGeoJSON,
      hoveredSlug: view.hoveredSlug,
      filteredUtilitySlugs: view.filteredUtilitySlugs,
    };
  }, [stack.routes, stack.current, view]);

  // Replace the active list route with a fresh-filter copy. The list
  // panel only renders when no detail is open (CommonGrid's list view
  // hides the map and detail layers), so the list route is always the
  // current top of the stack when a filter setter fires — a plain
  // `replace` is sufficient.
  const updateActiveListFilters = useCallback(
    (patch: Partial<Omit<ListRoutePayload, "tab" | "mode">>) => {
      const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
      if (!currentList) return;
      stack.replace(
        makeListRoute(currentList.payload.tab, currentList.payload.mode, {
          q: currentList.payload.q,
          segment: currentList.payload.segment,
          type: currentList.payload.type,
          jurisdictions: currentList.payload.jurisdictions,
          ...patch,
        })
      );
    },
    [stack]
  );

  // Mirror the active list-route tab onto the view-state listSource so
  // deep-linked URLs (e.g. /explore?tab=ev-charging) land on the right
  // panel and overlay configuration without the user having to click again.
  useEffect(() => {
    const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
    if (currentList && currentList.payload.tab !== view.listSource) {
      dispatch({ type: "SET_LIST_SOURCE", listSource: currentList.payload.tab });
    }
  }, [stack.routes, view.listSource]);

  const navigateToTab = useCallback(
    (tab: EntityTab) => {
      // Preserve the projection the user is currently looking at — switching
      // layers changes the subject, not the projection. See
      // lib/explorer/view-mode.ts.
      const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
      const carriedMode = carryViewMode(currentList?.payload.mode);
      // Tab switch resets the stack to [overview, list(newTab)]. Plain
      // `push` would keep an open detail (different type, peer eviction
      // misses it) on top of the new list — landing the user on a detail
      // from the OLD tab. Close + push the canonical 2-deep shape.
      stack.close();
      stack.push(makeOverviewRoute());
      stack.push(makeListRoute(tab, carriedMode));
      // Keep the panel's list-source in lock-step with the destination tab
      // so the right list panel renders immediately (the MapLayout reads
      // listSource, not state.tab, to decide which list panel to show).
      dispatch({ type: "SET_LIST_SOURCE", listSource: tab });
    },
    [stack]
  );

  const navigateToOverview = useCallback(() => {
    stack.close();
    stack.push(makeOverviewRoute());
  }, [stack]);

  const navigateToDetail = useCallback(
    (view: DetailView, slug: string) => {
      // The destination entity type — NOT the tab the user is currently on.
      // Cross-entity links (program → utility, utility → program) previously
      // reused `currentList.payload.tab`, so a utility link opened from the
      // Programs tab kept `tab=programs` and rendered ProgramDetailPanel with
      // a utility slug → "Program not found". Map the DetailView to its tab.
      const targetTab = detailViewToTab(view);
      const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");

      if (currentList?.payload.tab === targetTab) {
        // Same entity type: drill in on top of the current (filtered) list so
        // the back-arrow returns the user to their filtered list view.
        stack.push(makeDetailRoute(targetTab, slug));
        return;
      }

      // Different entity type: swap the underlying list route to the target
      // tab so the correct detail panel renders, the URL carries the right
      // `tab`, and the back-arrow returns to the destination entity's list.
      stack.close();
      stack.push(makeOverviewRoute());
      stack.push(makeListRoute(targetTab));
      stack.push(makeDetailRoute(targetTab, slug));
      dispatch({ type: "SET_LIST_SOURCE", listSource: targetTab });
    },
    [stack]
  );

  const setViewMode = useCallback(
    (mode: ExploreViewMode) => {
      const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
      const action = viewModeToggleAction(mode, currentList?.payload.mode);

      if (action === "noop") return;

      // Overview has no list route to reproject, so "Table" opens the layer
      // the map is currently showing (per the region selector sitting
      // immediately left of the toggle) as a table. The old code early
      // -returned here, which is what made both buttons inert on `/explore`.
      if (action === "open-list" || !currentList) {
        stack.push(makeListRoute(view.listSource, mode));
        return;
      }

      const nextList = makeListRoute(currentList.payload.tab, mode, {
        q: currentList.payload.q,
        segment: currentList.payload.segment,
        type: currentList.payload.type,
        jurisdictions: currentList.payload.jurisdictions,
      });

      // `stack.replace` swaps the TOP of the stack. With a detail open that
      // silently ate the detail route instead of re-projecting the list
      // underneath it, so rebuild the stack and put the detail back on top.
      const detail = stack.routes.find((r): r is Extract<ExploreRoute, { type: "detail" }> => r.type === "detail");
      if (detail) {
        stack.close();
        stack.push(makeOverviewRoute());
        stack.push(nextList);
        stack.push(detail);
        return;
      }

      stack.replace(nextList);
    },
    [stack, view.listSource]
  );

  const setListSource = useCallback((listSource: EntityTab) => dispatch({ type: "SET_LIST_SOURCE", listSource }), []);
  const setFilters = updateActiveListFilters;
  const setSearch = useCallback((q: string) => updateActiveListFilters({ q }), [updateActiveListFilters]);
  const setSegment = useCallback((segment: string) => updateActiveListFilters({ segment }), [updateActiveListFilters]);
  const setTypeFilter = useCallback(
    (typeFilter: string) => updateActiveListFilters({ type: typeFilter }),
    [updateActiveListFilters]
  );
  const setJurisdictions = useCallback(
    (jurisdictions: string[]) => updateActiveListFilters({ jurisdictions }),
    [updateActiveListFilters]
  );
  const setHighlight = useCallback(
    (geoJSON: FeatureCollection | null) => dispatch({ type: "SET_HIGHLIGHT", geoJSON }),
    []
  );
  const setHoveredSlug = useCallback((slug: string | null) => dispatch({ type: "SET_HOVERED_SLUG", slug }), []);
  const setFilteredUtilitySlugs = useCallback(
    (slugs: string[] | null) => dispatch({ type: "SET_FILTERED_UTILITY_SLUGS", slugs }),
    []
  );

  const goBack = useCallback(() => {
    if (stack.canGoBack) {
      stack.back();
    }
  }, [stack]);

  const value = useMemo<ExplorerContextValue>(
    () => ({
      state,
      stack,
      navigateToTab,
      navigateToOverview,
      navigateToDetail,
      setListSource,
      setFilters,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      setFilteredUtilitySlugs,
      goBack,
      setViewMode,
    }),
    [
      state,
      stack,
      navigateToTab,
      navigateToOverview,
      navigateToDetail,
      setListSource,
      setFilters,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      setFilteredUtilitySlugs,
      goBack,
      setViewMode,
    ]
  );

  return <ExplorerCtx.Provider value={value}>{children}</ExplorerCtx.Provider>;
}
