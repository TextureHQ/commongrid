"use client";

import type { ExploreRouteDescriptor } from "@texturehq/edges-explore";
import {
  createExploreRouteStackState,
  popExploreRoute,
  pushDeeperExploreRoute,
  pushExploreRoute,
  replaceExploreRoute,
} from "@texturehq/edges-explore/routes";
import type { FeatureCollection } from "geojson";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { detailViewToTab } from "@/lib/explorer/detail-view-tab";
import {
  EXPLORE_BASE_PATH,
  type ExplorePathItem,
  type EntityTab as PathEntityTab,
  parseExplorePath,
  serializeExplorePath,
} from "@/lib/explorer/explore-path";
import { carryViewMode, type ExploreViewMode, parseViewMode, resolveViewMode } from "@/lib/explorer/view-mode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityTab = PathEntityTab;
export type { ExploreViewMode };
export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant";

/**
 * Route shape for CommonGrid's explore stack.
 *
 * As of CG-252 the URL *path* is the persisted form of the navigation stack;
 * query params carry view options only (`?mode=table`, `?q=`, and the list
 * filters). A `list` route owns its filter/view state in `payload`; a
 * `detail` route carries the entity slug plus the `entityKind` that records
 * which list context it belongs to.
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

/**
 * Default projection for a freshly opened list route.
 *
 * CG-252 acceptance criterion 6: the default view everywhere is the map, and
 * `?mode=table` is the only way table mode ever appears in a URL. Every tab
 * therefore defaults to "map"; the homepage entry points that want a table
 * request it explicitly with `?mode=table`.
 */
export const DEFAULT_MODE_FOR_TAB: Record<EntityTab, ExploreViewMode> = {
  utilities: "map",
  "grid-operators": "map",
  programs: "map",
  rates: "map",
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
    id: `detail:${entityKind}:${slug}`,
    payload: { entityKind, slug },
  };
}

const getRouteKey = (route: ExploreRoute): string => route.id;
const getRouteType = (route: ExploreRoute): string => route.type;

// ---------------------------------------------------------------------------
// Path ↔ stack serialization
//
// The path grammar itself lives in lib/explorer/explore-path.ts (pure,
// unit-tested). These helpers translate between that framework-free
// `ExplorePathItem[]` and the app's richer `ExploreRoute[]`, and split the
// view options out into query params.
// ---------------------------------------------------------------------------

function routeToPathItem(route: ExploreRoute): ExplorePathItem {
  if (route.type === "overview") return { kind: "overview" };
  if (route.type === "list") return { kind: "list", tab: route.payload.tab };
  return { kind: "detail", entityKind: route.payload.entityKind, slug: route.payload.slug };
}

function findList(routes: ExploreRoute[]): Extract<ExploreRoute, { type: "list" }> | undefined {
  return routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
}

/**
 * Split the pathname after `/explore` into path segments.
 */
function pathnameToSegments(pathname: string | null): string[] {
  if (!pathname) return [];
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  const parts = trimmed.split("/");
  if (parts[0] !== "explore") return [];
  return parts.slice(1);
}

/**
 * Parse the current pathname + query into a stack of explore routes, oldest
 * (overview root) to newest. The path supplies the navigation structure; the
 * query supplies the active list route's view options (mode + filters).
 */
function parseRoutes(pathname: string | null, params: URLSearchParams): ExploreRoute[] {
  const items = parseExplorePath(pathnameToSegments(pathname));

  const mode = parseViewMode(params.get("mode")) ?? DEFAULT_MODE_FOR_TAB[DEFAULT_TAB];
  const filters = {
    q: params.get("q") ?? "",
    segment: params.get("segment") ?? "all",
    type: params.get("type") ?? "all",
    jurisdictions: params.get("jurisdictions")?.split(",").filter(Boolean) ?? [],
  };

  return items.map((item) => {
    if (item.kind === "overview") return makeOverviewRoute();
    if (item.kind === "list") return makeListRoute(item.tab, mode, filters);
    return makeDetailRoute(item.entityKind, item.slug);
  });
}

/**
 * Serialize a stack of routes into its `/explore` pathname.
 */
function serializePath(routes: ExploreRoute[]): string {
  return serializeExplorePath(routes.map(routeToPathItem));
}

/**
 * Serialize the active list route's view options into query params. Only the
 * view options ever live in the query — never navigation state.
 *
 *  - `mode` is emitted only when it is `table` (map is the default everywhere).
 *  - `q` / `segment` / `type` / `jurisdictions` are emitted only when set.
 */
function serializeQuery(routes: ExploreRoute[]): URLSearchParams {
  const params = new URLSearchParams();
  const list = findList(routes);
  if (!list) return params;

  if (list.payload.mode === "table") params.set("mode", "table");
  if (list.payload.q) params.set("q", list.payload.q);
  if (list.payload.segment && list.payload.segment !== "all") params.set("segment", list.payload.segment);
  if (list.payload.type && list.payload.type !== "all") params.set("type", list.payload.type);
  if (list.payload.jurisdictions.length > 0) params.set("jurisdictions", list.payload.jurisdictions.join(","));
  return params;
}

/** Build the full `pathname[?query]` string a stack serializes to. */
function serializeUrl(routes: ExploreRoute[]): string {
  const path = serializePath(routes);
  const query = serializeQuery(routes).toString();
  return query ? `${path}?${query}` : path;
}

// ---------------------------------------------------------------------------
// Path-backed route stack
//
// Mirrors the shape of `useUrlExploreRouteStack` from @texturehq/edges-explore
// but persists the navigation structure in the URL *path* (via
// history.replaceState) rather than in search params. The in-memory route
// array is the working copy; the URL is the persisted form.
//
// The sync discipline is inherited from CG-257: internal navigations write the
// URL through raw `history.replaceState` (which does NOT update Next's
// usePathname/useSearchParams), so the external-change effect stays quiet for
// them. Only genuine Next navigations (e.g. a global-search `router.push`) and
// browser back/forward update those hooks and trigger a re-parse.
// ---------------------------------------------------------------------------

interface PathExploreStack {
  routes: ExploreRoute[];
  current: ExploreRoute | null;
  previous: ExploreRoute | null;
  canGoBack: boolean;
  push: (route: ExploreRoute) => void;
  pushDeeper: (route: ExploreRoute) => void;
  replace: (route: ExploreRoute | null) => void;
  back: () => void;
  close: () => void;
  reset: (routes: ExploreRoute[]) => void;
  serializedUrl: string;
}

function usePathExploreRouteStack(pathname: string | null, searchParams: URLSearchParams): PathExploreStack {
  const [routes, setRoutes] = useState<ExploreRoute[]>(() => parseRoutes(pathname, searchParams));

  const push = useCallback((route: ExploreRoute) => {
    setRoutes((current) => pushExploreRoute(current, route, getRouteKey, getRouteType));
  }, []);
  const pushDeeper = useCallback((route: ExploreRoute) => {
    setRoutes((current) => pushDeeperExploreRoute(current, route, getRouteKey));
  }, []);
  const replace = useCallback((route: ExploreRoute | null) => {
    setRoutes((current) => replaceExploreRoute(current, route));
  }, []);
  const back = useCallback(() => {
    setRoutes((current) => popExploreRoute(current));
  }, []);
  const close = useCallback(() => {
    setRoutes([makeOverviewRoute()]);
  }, []);
  const reset = useCallback((next: ExploreRoute[]) => {
    setRoutes(next.length > 0 ? next : [makeOverviewRoute()]);
  }, []);

  const state = useMemo(() => createExploreRouteStackState(routes), [routes]);
  const serializedUrl = useMemo(() => serializeUrl(routes), [routes]);

  return { ...state, push, pushDeeper, replace, back, close, reset, serializedUrl };
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

export interface ExplorerState {
  tab: EntityTab;
  listSource: EntityTab;
  mode: "overview" | "list" | "detail";
  viewMode: ExploreViewMode;
  slug: string | null;
  /**
   * The entity kind of the current detail route (top of the stack). This is
   * the authoritative subject of a detail view — NOT `tab`/`listSource`, which
   * track the underlying list. For a program nested under a utility the list
   * tab is `utilities` while the open detail is a `programs` entity, so the
   * panel dispatcher must key off this to render ProgramDetailPanel.
   */
  detailKind: EntityTab | null;
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
  stack: PathExploreStack;
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

export function ExplorerProvider({ children }: ExplorerProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, dispatch] = useReducer(viewReducer, INITIAL_VIEW_STATE);

  const searchString = searchParams?.toString() ?? "";
  const stack = usePathExploreRouteStack(
    pathname,
    useMemo(() => new URLSearchParams(searchString), [searchString])
  );

  // Track the last URL we synced to avoid ping-pong between the stack→URL
  // write and the URL→stack re-parse. Seeded to the stack's initial URL.
  const lastSyncedUrl = useRef(stack.serializedUrl);

  // Read the live stack through a ref so the URL→stack effect can depend only
  // on the incoming pathname/search, never on the stack object (which is a
  // fresh literal every render). See CG-257.
  const stackRef = useRef(stack);
  stackRef.current = stack;

  // Stack → URL. Raw history.replaceState avoids Next's routing machinery
  // (router.replace re-renders and can feed back into useSearchParams /
  // usePathname, which is what caused the CG-257 render loop).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = stack.serializedUrl;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
    lastSyncedUrl.current = next;
  }, [stack.serializedUrl]);

  // URL → Stack for external navigations. Next's router.push (e.g. from the
  // global search box) updates usePathname/useSearchParams but our internal
  // replaceState writes do not, so this effect only reacts to genuine external
  // URL changes and browser back/forward.
  useEffect(() => {
    const activeStack = stackRef.current;
    const incomingUrl = searchString
      ? `${pathname ?? EXPLORE_BASE_PATH}?${searchString}`
      : (pathname ?? EXPLORE_BASE_PATH);

    // Ignore if this matches what we just wrote, or the current stack already.
    if (incomingUrl === lastSyncedUrl.current || incomingUrl === activeStack.serializedUrl) {
      lastSyncedUrl.current = incomingUrl;
      return;
    }

    const incomingParams = new URLSearchParams(searchString);
    const newRoutes = parseRoutes(pathname, incomingParams);

    // If the external URL didn't explicitly request a mode, preserve the
    // user's current projection (map vs table) rather than snapping to the
    // default — matches the internal tab-switch behavior.
    if (!incomingParams.has("mode")) {
      const currentList = findList(activeStack.routes);
      const newList = findList(newRoutes);
      if (currentList && newList) {
        newList.payload.mode = carryViewMode(currentList.payload.mode);
      }
    }

    if (serializeUrl(newRoutes) === activeStack.serializedUrl) {
      lastSyncedUrl.current = incomingUrl;
      return;
    }

    activeStack.reset(newRoutes);
    const newList = findList(newRoutes);
    if (newList) dispatch({ type: "SET_LIST_SOURCE", listSource: newList.payload.tab });
    lastSyncedUrl.current = incomingUrl;
  }, [pathname, searchString]);

  // Derive the legacy ExplorerState shape from the stack + view state.
  const state = useMemo<ExplorerState>(() => {
    const currentList = findList(stack.routes);
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
    const viewMode = resolveViewMode(currentList?.payload.mode);
    return {
      tab,
      listSource: view.listSource,
      mode,
      viewMode,
      slug: detail?.payload.slug ?? null,
      detailKind: detail?.payload.entityKind ?? null,
      q: filters.q,
      segment: filters.segment,
      type: filters.type,
      jurisdictions: filters.jurisdictions,
      highlightGeoJSON: view.highlightGeoJSON,
      hoveredSlug: view.hoveredSlug,
      filteredUtilitySlugs: view.filteredUtilitySlugs,
    };
  }, [stack.routes, stack.current, view]);

  // Replace the active list route with a fresh-filter copy.
  const updateActiveListFilters = useCallback(
    (patch: Partial<Omit<ListRoutePayload, "tab" | "mode">>) => {
      const currentList = findList(stack.routes);
      if (!currentList) return;
      // The list route may sit under an open detail (e.g. filtering is only
      // reachable from the list view, but be defensive). Rebuild in place.
      const nextList = makeListRoute(currentList.payload.tab, currentList.payload.mode, {
        q: currentList.payload.q,
        segment: currentList.payload.segment,
        type: currentList.payload.type,
        jurisdictions: currentList.payload.jurisdictions,
        ...patch,
      });
      if (stack.current?.type === "list") {
        stack.replace(nextList);
        return;
      }
      stack.reset(stack.routes.map((r) => (r.type === "list" ? nextList : r)));
    },
    [stack]
  );

  // Keep the panel's list-source in lock-step with the active list tab so
  // deep-linked URLs land on the right panel/overlay config.
  useEffect(() => {
    const currentList = findList(stack.routes);
    if (currentList && currentList.payload.tab !== view.listSource) {
      dispatch({ type: "SET_LIST_SOURCE", listSource: currentList.payload.tab });
    }
  }, [stack.routes, view.listSource]);

  const navigateToTab = useCallback(
    (tab: EntityTab) => {
      const currentList = findList(stack.routes);
      const carriedMode = carryViewMode(currentList?.payload.mode);
      // Tab switch resets the stack to [overview, list(newTab)].
      stack.reset([makeOverviewRoute(), makeListRoute(tab, carriedMode)]);
      dispatch({ type: "SET_LIST_SOURCE", listSource: tab });
    },
    [stack]
  );

  const navigateToOverview = useCallback(() => {
    stack.reset([makeOverviewRoute()]);
  }, [stack]);

  const navigateToDetail = useCallback(
    (view: DetailView, slug: string) => {
      const targetTab = detailViewToTab(view);
      const currentList = findList(stack.routes);
      const top = stack.current;

      // Nested program under the utility currently in view: pushDeeper so the
      // stack keeps both details and the path becomes
      // /explore/utilities/:utilitySlug/programs/:programSlug. Back then pops
      // the program and lands on the utility (not the utilities list).
      if (view === "program" && top?.type === "detail" && top.payload.entityKind === "utilities") {
        stack.pushDeeper(makeDetailRoute("programs", slug));
        return;
      }

      // Same-entity drill-in from that entity's own list: push the detail on
      // top of the (filtered) list so back returns to the filtered list.
      if (currentList?.payload.tab === targetTab && top?.type === "list") {
        stack.push(makeDetailRoute(targetTab, slug));
        return;
      }

      // Everything else (cross-entity links, map/search clicks): open the
      // entity top-level in its own list context. A direct program opened this
      // way lands on /explore/programs/:programSlug.
      stack.reset([makeOverviewRoute(), makeListRoute(targetTab), makeDetailRoute(targetTab, slug)]);
      dispatch({ type: "SET_LIST_SOURCE", listSource: targetTab });
    },
    [stack]
  );

  const setViewMode = useCallback(
    (mode: ExploreViewMode) => {
      const currentList = findList(stack.routes);

      // Overview has no list route to reproject: "Table" opens the layer the
      // map is currently showing (per the region selector) as a table.
      if (!currentList) {
        if (mode === "map") return;
        stack.push(makeListRoute(view.listSource, mode));
        return;
      }

      if (currentList.payload.mode === mode) return;

      const nextList = makeListRoute(currentList.payload.tab, mode, {
        q: currentList.payload.q,
        segment: currentList.payload.segment,
        type: currentList.payload.type,
        jurisdictions: currentList.payload.jurisdictions,
      });

      // Reproject the list route in place, preserving any open detail on top.
      stack.reset(stack.routes.map((r) => (r.type === "list" ? nextList : r)));
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
    if (stack.canGoBack) stack.back();
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
