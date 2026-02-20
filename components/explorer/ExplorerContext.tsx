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

export type ViewMode = "landing" | "list" | "detail";
export type ListView = "utilities" | "grid-operators";
export type DetailView = "utility" | "iso" | "rto" | "ba";
export type EntityView = ListView | DetailView;

export interface ExplorerState {
  mode: ViewMode;
  view: EntityView | null;
  slug: string | null;
  // List filters (persisted in URL)
  q: string;
  segment: string;
  type: string;
  // Map interaction
  highlightGeoJSON: FeatureCollection | null;
  hoveredSlug: string | null;
  // Navigation history for back button
  previousView: { view: EntityView | null; slug: string | null } | null;
}

type ExplorerAction =
  | { type: "NAVIGATE_LANDING" }
  | { type: "NAVIGATE_LIST"; view: ListView }
  | { type: "NAVIGATE_DETAIL"; view: DetailView; slug: string }
  | { type: "SET_SEARCH"; q: string }
  | { type: "SET_SEGMENT"; segment: string }
  | { type: "SET_TYPE"; typeFilter: string }
  | { type: "SET_HIGHLIGHT"; geoJSON: FeatureCollection | null }
  | { type: "SET_HOVERED_SLUG"; slug: string | null }
  | { type: "SYNC_FROM_URL"; mode: ViewMode; view: EntityView | null; slug: string | null; q: string; segment: string; typeFilter: string };

interface ExplorerContextValue {
  state: ExplorerState;
  navigateToLanding: () => void;
  navigateToList: (view: ListView) => void;
  navigateToDetail: (view: DetailView, slug: string) => void;
  setSearch: (q: string) => void;
  setSegment: (segment: string) => void;
  setTypeFilter: (type: string) => void;
  setHighlight: (geoJSON: FeatureCollection | null) => void;
  setHoveredSlug: (slug: string | null) => void;
  goBack: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: ExplorerState = {
  mode: "list",
  view: "utilities",
  slug: null,
  q: "",
  segment: "all",
  type: "all",
  highlightGeoJSON: null,
  hoveredSlug: null,
  previousView: null,
};

function reducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "NAVIGATE_LANDING":
      return {
        ...state,
        mode: "list",
        view: "utilities",
        slug: null,
        q: "",
        segment: "all",
        type: "all",
        highlightGeoJSON: null,
        hoveredSlug: null,
        previousView: null,
      };

    case "NAVIGATE_LIST":
      return {
        ...state,
        mode: "list",
        view: action.view,
        slug: null,
        highlightGeoJSON: null,
        hoveredSlug: null,
        previousView: { view: state.view, slug: state.slug },
      };

    case "NAVIGATE_DETAIL":
      return {
        ...state,
        mode: "detail",
        view: action.view,
        slug: action.slug,
        hoveredSlug: null,
        previousView: { view: state.view, slug: state.slug },
      };

    case "SET_SEARCH":
      return { ...state, q: action.q };

    case "SET_SEGMENT":
      return { ...state, segment: action.segment };

    case "SET_TYPE":
      return { ...state, type: action.typeFilter };

    case "SET_HIGHLIGHT":
      return { ...state, highlightGeoJSON: action.geoJSON };

    case "SET_HOVERED_SLUG":
      return { ...state, hoveredSlug: action.slug };

    case "SYNC_FROM_URL":
      return {
        ...state,
        mode: action.mode,
        view: action.view,
        slug: action.slug,
        q: action.q,
        segment: action.segment,
        type: action.typeFilter,
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
  if (state.view) params.set("view", state.view);
  if (state.slug) params.set("slug", state.slug);
  if (state.q) params.set("q", state.q);
  if (state.segment && state.segment !== "all") params.set("segment", state.segment);
  if (state.type && state.type !== "all") params.set("type", state.type);
  const str = params.toString();
  return str ? `/explore?${str}` : "/explore";
}

function parseViewMode(view: string | null): { mode: ViewMode; view: EntityView | null } {
  if (!view) return { mode: "list", view: "utilities" };
  if (view === "utilities" || view === "grid-operators") {
    return { mode: "list", view };
  }
  if (view === "utility" || view === "iso" || view === "rto" || view === "ba") {
    return { mode: "detail", view };
  }
  return { mode: "list", view: "utilities" };
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
    const viewParam = searchParams.get("view");
    const slugParam = searchParams.get("slug");
    const qParam = searchParams.get("q") ?? "";
    const segmentParam = searchParams.get("segment") ?? "all";
    const typeParam = searchParams.get("type") ?? "all";

    const { mode, view } = parseViewMode(viewParam);

    // Only sync if URL differs from current state
    if (
      mode !== state.mode ||
      view !== state.view ||
      slugParam !== state.slug ||
      qParam !== state.q ||
      segmentParam !== state.segment ||
      typeParam !== state.type
    ) {
      isUrlSync.current = true;
      dispatch({
        type: "SYNC_FROM_URL",
        mode,
        view,
        slug: slugParam,
        q: qParam,
        segment: segmentParam,
        typeFilter: typeParam,
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
  }, [state.mode, state.view, state.slug, state.q, state.segment, state.type]);

  const navigateToLanding = useCallback(() => dispatch({ type: "NAVIGATE_LANDING" }), []);
  const navigateToList = useCallback((view: ListView) => dispatch({ type: "NAVIGATE_LIST", view }), []);
  const navigateToDetail = useCallback(
    (view: DetailView, slug: string) => dispatch({ type: "NAVIGATE_DETAIL", view, slug }),
    []
  );
  const setSearch = useCallback((q: string) => dispatch({ type: "SET_SEARCH", q }), []);
  const setSegment = useCallback((segment: string) => dispatch({ type: "SET_SEGMENT", segment }), []);
  const setTypeFilter = useCallback((type: string) => dispatch({ type: "SET_TYPE", typeFilter: type }), []);
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
    if (!prev || !prev.view) {
      dispatch({ type: "NAVIGATE_LANDING" });
      return;
    }
    // If previous was a list view, navigate back to list
    if (prev.view === "utilities" || prev.view === "grid-operators") {
      dispatch({ type: "NAVIGATE_LIST", view: prev.view });
    } else if (prev.slug) {
      dispatch({ type: "NAVIGATE_DETAIL", view: prev.view, slug: prev.slug });
    } else {
      dispatch({ type: "NAVIGATE_LANDING" });
    }
  }, [state.previousView]);

  const value = useMemo<ExplorerContextValue>(
    () => ({
      state,
      navigateToLanding,
      navigateToList,
      navigateToDetail,
      setSearch,
      setSegment,
      setTypeFilter,
      setHighlight,
      setHoveredSlug,
      goBack,
    }),
    [state, navigateToLanding, navigateToList, navigateToDetail, setSearch, setSegment, setTypeFilter, setHighlight, setHoveredSlug, goBack]
  );

  return <ExplorerCtx.Provider value={value}>{children}</ExplorerCtx.Provider>;
}
