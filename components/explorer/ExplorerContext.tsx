"use client";

import { type UrlExploreRouteStackController, useUrlExploreRouteStack } from "@texturehq/edges-explore";
import type { FeatureCollection } from "geojson";
import { useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { detailViewToTab } from "@/lib/explorer/detail-view-tab";
import {
  DEFAULT_TAB,
  type DetailRoutePayload,
  type EntityTab,
  type ExploreRoute,
  type ListRoutePayload,
  makeDetailRoute,
  makeListRoute,
  makeOverviewRoute,
  parseExploreRoutes,
  serializeExploreRoutes,
  type ViewMode,
} from "./explorer-route-state";

export type { DetailRoutePayload, EntityTab, ExploreRoute, ListRoutePayload, ViewMode };
export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant";

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

const initialView: ViewState = {
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

export interface ExplorerState {
  tab: EntityTab;
  listSource: EntityTab;
  viewMode: ViewMode;
  mode: "overview" | "list" | "detail";
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
  setViewMode: (viewMode: ViewMode) => void;
  setSearch: (q: string) => void;
  setSegment: (segment: string) => void;
  setTypeFilter: (type: string) => void;
  setJurisdictions: (jurisdictions: string[]) => void;
  setHighlight: (geoJSON: FeatureCollection | null) => void;
  setHoveredSlug: (slug: string | null) => void;
  setFilteredUtilitySlugs: (slugs: string[] | null) => void;
  goBack: () => void;
}

const ExplorerCtx = createContext<ExplorerContextValue | null>(null);

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerCtx);
  if (!ctx) throw new Error("useExplorer must be used within ExplorerProvider");
  return ctx;
}

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [view, dispatch] = useReducer(viewReducer, initialView);

  const stack = useUrlExploreRouteStack<ExploreRoute>({
    parse: parseExploreRoutes,
    serialize: serializeExploreRoutes,
    initialSearch: searchParams?.toString(),
    getRouteKey: (route) => route.id,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = serializeExploreRoutes(stack.routes).toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
    }
  }, [stack.routes]);

  const state = useMemo<ExplorerState>(() => {
    const currentList = stack.routes.find(
      (route): route is Extract<ExploreRoute, { type: "list" }> => route.type === "list"
    );
    const detail = stack.current?.type === "detail" ? stack.current : null;
    const current = stack.current;
    const mode: ExplorerState["mode"] = detail ? "detail" : current?.type === "overview" ? "overview" : "list";
    const filters = currentList?.payload ?? {
      tab: DEFAULT_TAB,
      q: "",
      segment: "all",
      type: "all",
      jurisdictions: [],
      viewMode: "map" as ViewMode,
    };

    return {
      tab: currentList?.payload.tab ?? DEFAULT_TAB,
      listSource: view.listSource,
      viewMode: currentList?.payload.viewMode ?? "map",
      mode,
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

  const updateActiveListFilters = useCallback(
    (patch: Partial<Omit<ListRoutePayload, "tab">>) => {
      const currentList = stack.routes.find(
        (route): route is Extract<ExploreRoute, { type: "list" }> => route.type === "list"
      );
      if (!currentList) return;
      stack.replace(
        makeListRoute(currentList.payload.tab, {
          q: currentList.payload.q,
          segment: currentList.payload.segment,
          type: currentList.payload.type,
          jurisdictions: currentList.payload.jurisdictions,
          viewMode: currentList.payload.viewMode,
          ...patch,
        })
      );
    },
    [stack]
  );

  useEffect(() => {
    const currentList = stack.routes.find(
      (route): route is Extract<ExploreRoute, { type: "list" }> => route.type === "list"
    );
    if (currentList && currentList.payload.tab !== view.listSource) {
      dispatch({ type: "SET_LIST_SOURCE", listSource: currentList.payload.tab });
    }
  }, [stack.routes, view.listSource]);

  const navigateToTab = useCallback(
    (tab: EntityTab) => {
      stack.close();
      stack.push(makeOverviewRoute());
      stack.push(makeListRoute(tab));
      dispatch({ type: "SET_LIST_SOURCE", listSource: tab });
    },
    [stack]
  );

  const navigateToOverview = useCallback(() => {
    stack.close();
    stack.push(makeOverviewRoute());
  }, [stack]);

  const navigateToDetail = useCallback(
    (viewName: DetailView, slug: string) => {
      const targetTab = detailViewToTab(viewName);
      const currentList = stack.routes.find(
        (route): route is Extract<ExploreRoute, { type: "list" }> => route.type === "list"
      );

      if (currentList?.payload.tab === targetTab) {
        stack.push(makeDetailRoute(targetTab, slug));
        return;
      }

      stack.close();
      stack.push(makeOverviewRoute());
      stack.push(makeListRoute(targetTab));
      stack.push(makeDetailRoute(targetTab, slug));
      dispatch({ type: "SET_LIST_SOURCE", listSource: targetTab });
    },
    [stack]
  );

  const setListSource = useCallback((listSource: EntityTab) => dispatch({ type: "SET_LIST_SOURCE", listSource }), []);
  const setViewMode = useCallback(
    (viewMode: ViewMode) => updateActiveListFilters({ viewMode }),
    [updateActiveListFilters]
  );
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
      setViewMode,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      setFilteredUtilitySlugs,
      goBack,
    }),
    [
      state,
      stack,
      navigateToTab,
      navigateToOverview,
      navigateToDetail,
      setListSource,
      setViewMode,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      setFilteredUtilitySlugs,
      goBack,
    ]
  );

  return <ExplorerCtx.Provider value={value}>{children}</ExplorerCtx.Provider>;
}
