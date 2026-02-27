"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FeatureCollection } from "geojson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayoutMode = "hybrid" | "list" | "map";
export type EntityTab = "utilities" | "grid-operators" | "power-plants" | "programs" | "transmission-lines";
export type ViewMode = "landing" | "list" | "detail";
export type DetailView = "utility" | "iso" | "rto" | "ba" | "program";
export type ListView = EntityTab;
export type EntityView = EntityTab | DetailView;

export interface ExplorerState {
  layout: LayoutMode;
  tab: EntityTab;
  mode: ViewMode;
  slug: string | null;
  // List filters (persisted in URL)
  q: string;
  segment: string;
  type: string;
  jurisdictions: string[]; // selected state codes for multi-select jurisdiction filter
  // Map interaction
  highlightGeoJSON: FeatureCollection | null;
  hoveredSlug: string | null;
  // Navigation history for back button
  previousView: { tab: EntityTab; slug: string | null } | null;
}

type ExplorerAction =
  | { type: "NAVIGATE_TAB"; tab: EntityTab }
  | { type: "NAVIGATE_DETAIL"; view: DetailView; slug: string }
  | { type: "SET_LAYOUT"; layout: LayoutMode }
  | { type: "SET_SEARCH"; q: string }
  | { type: "SET_SEGMENT"; segment: string }
  | { type: "SET_TYPE"; typeFilter: string }
  | { type: "SET_JURISDICTIONS"; jurisdictions: string[] }
  | { type: "SET_HIGHLIGHT"; geoJSON: FeatureCollection | null }
  | { type: "SET_HOVERED_SLUG"; slug: string | null }
  | {
      type: "SYNC_FROM_URL";
      layout: LayoutMode;
      tab: EntityTab;
      slug: string | null;
      q: string;
      segment: string;
      typeFilter: string;
      jurisdictions: string[];
    };

interface ExplorerContextValue {
  state: ExplorerState;
  navigateToTab: (tab: EntityTab) => void;
  navigateToDetail: (view: DetailView, slug: string) => void;
  setLayout: (layout: LayoutMode) => void;
  setSearch: (q: string) => void;
  setSegment: (segment: string) => void;
  setTypeFilter: (type: string) => void;
  setJurisdictions: (jurisdictions: string[]) => void;
  setHighlight: (geoJSON: FeatureCollection | null) => void;
  setHoveredSlug: (slug: string | null) => void;
  goBack: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: ExplorerState = {
  layout: "hybrid",
  tab: "utilities",
  mode: "list",
  slug: null,
  q: "",
  segment: "all",
  type: "all",
  jurisdictions: [],
  highlightGeoJSON: null,
  hoveredSlug: null,
  previousView: null,
};

function reducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "NAVIGATE_TAB":
      return {
        ...state,
        tab: action.tab,
        mode: "list",
        slug: null,
        q: "",
        segment: "all",
        type: "all",
        jurisdictions: [],
        highlightGeoJSON: null,
        hoveredSlug: null,
        previousView: null,
      };

    case "NAVIGATE_DETAIL":
      return {
        ...state,
        mode: "detail",
        slug: action.slug,
        hoveredSlug: null,
        previousView: { tab: state.tab, slug: state.slug },
      };

    case "SET_LAYOUT":
      return { ...state, layout: action.layout };

    case "SET_SEARCH":
      return { ...state, q: action.q };

    case "SET_SEGMENT":
      return { ...state, segment: action.segment };

    case "SET_TYPE":
      return { ...state, type: action.typeFilter };

    case "SET_JURISDICTIONS":
      return { ...state, jurisdictions: action.jurisdictions };

    case "SET_HIGHLIGHT":
      return { ...state, highlightGeoJSON: action.geoJSON };

    case "SET_HOVERED_SLUG":
      return { ...state, hoveredSlug: action.slug };

    case "SYNC_FROM_URL":
      return {
        ...state,
        layout: action.layout,
        tab: action.tab,
        slug: action.slug,
        q: action.q,
        segment: action.segment,
        type: action.typeFilter,
        jurisdictions: action.jurisdictions,
        mode: action.slug ? "detail" : "list",
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function stateToSearchParams(state: ExplorerState): string {
  const params = new URLSearchParams();
  params.set("tab", state.tab);
  if (state.layout !== "hybrid") params.set("layout", state.layout);
  if (state.slug) params.set("slug", state.slug);
  if (state.q) params.set("q", state.q);
  if (state.segment && state.segment !== "all") params.set("segment", state.segment);
  if (state.type && state.type !== "all") params.set("type", state.type);
  if (state.jurisdictions && state.jurisdictions.length > 0)
    params.set("jurisdictions", state.jurisdictions.join(","));
  const str = params.toString();
  return str ? `/explore?${str}` : "/explore";
}

function parseTab(value: string | null): EntityTab {
  const valid: EntityTab[] = [
    "utilities",
    "grid-operators",
    "power-plants",
    "programs",
    "transmission-lines",
  ];
  // backwards-compat: old "view" param values that were list views
  if (value === "grid-operators" || value === "programs") return value;
  if (valid.includes(value as EntityTab)) return value as EntityTab;
  return "utilities";
}

function parseLayout(value: string | null): LayoutMode {
  if (value === "list" || value === "map" || value === "hybrid") return value;
  return "hybrid";
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

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, initialState);
  const isUrlSync = useRef(false);

  // Sync state FROM URL on mount and on popstate (browser back/forward)
  useEffect(() => {
    // Support old ?view= param for backwards compat
    const tabParam = searchParams.get("tab") ?? searchParams.get("view");
    const slugParam = searchParams.get("slug");
    const layoutParam = searchParams.get("layout");
    const qParam = searchParams.get("q") ?? "";
    const segmentParam = searchParams.get("segment") ?? "all";
    const typeParam = searchParams.get("type") ?? "all";
    const jurisdictionsParam = searchParams.get("jurisdictions");
    const jurisdictionsFromUrl = jurisdictionsParam
      ? jurisdictionsParam.split(",").filter(Boolean)
      : [];

    const tab = parseTab(tabParam);
    const layout = parseLayout(layoutParam);

    if (
      layout !== state.layout ||
      tab !== state.tab ||
      slugParam !== state.slug ||
      qParam !== state.q ||
      segmentParam !== state.segment ||
      typeParam !== state.type ||
      JSON.stringify(jurisdictionsFromUrl) !== JSON.stringify(state.jurisdictions)
    ) {
      isUrlSync.current = true;
      dispatch({
        type: "SYNC_FROM_URL",
        layout,
        tab,
        slug: slugParam,
        q: qParam,
        segment: segmentParam,
        typeFilter: typeParam,
        jurisdictions: jurisdictionsFromUrl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync state TO URL when state changes (but not when syncing from URL)
  useEffect(() => {
    if (isUrlSync.current) {
      isUrlSync.current = false;
      return;
    }
    const url = stateToSearchParams(state);
    router.push(url, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layout, state.tab, state.slug, state.q, state.segment, state.type, state.jurisdictions]);

  const navigateToTab = useCallback(
    (tab: EntityTab) => dispatch({ type: "NAVIGATE_TAB", tab }),
    []
  );
  const navigateToDetail = useCallback(
    (view: DetailView, slug: string) => dispatch({ type: "NAVIGATE_DETAIL", view, slug }),
    []
  );
  const setLayout = useCallback(
    (layout: LayoutMode) => dispatch({ type: "SET_LAYOUT", layout }),
    []
  );
  const setSearch = useCallback((q: string) => dispatch({ type: "SET_SEARCH", q }), []);
  const setSegment = useCallback(
    (segment: string) => dispatch({ type: "SET_SEGMENT", segment }),
    []
  );
  const setTypeFilter = useCallback(
    (type: string) => dispatch({ type: "SET_TYPE", typeFilter: type }),
    []
  );
  const setJurisdictions = useCallback(
    (jurisdictions: string[]) => dispatch({ type: "SET_JURISDICTIONS", jurisdictions }),
    []
  );
  const setHighlight = useCallback(
    (geoJSON: FeatureCollection | null) => dispatch({ type: "SET_HIGHLIGHT", geoJSON }),
    []
  );
  const setHoveredSlug = useCallback(
    (slug: string | null) => dispatch({ type: "SET_HOVERED_SLUG", slug }),
    []
  );

  const goBack = useCallback(() => {
    const prev = state.previousView;
    if (!prev) {
      dispatch({ type: "NAVIGATE_TAB", tab: state.tab });
      return;
    }
    dispatch({ type: "NAVIGATE_TAB", tab: prev.tab });
  }, [state.previousView, state.tab]);

  const value = useMemo<ExplorerContextValue>(
    () => ({
      state,
      navigateToTab,
      navigateToDetail,
      setLayout,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      goBack,
    }),
    [
      state,
      navigateToTab,
      navigateToDetail,
      setLayout,
      setSearch,
      setSegment,
      setTypeFilter,
      setJurisdictions,
      setHighlight,
      setHoveredSlug,
      goBack,
    ]
  );

  return <ExplorerCtx.Provider value={value}>{children}</ExplorerCtx.Provider>;
}
