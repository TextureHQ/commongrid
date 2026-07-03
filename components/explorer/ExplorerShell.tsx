"use client";

import "@/app/(shell)/explore/explore.css";
import { ExploreShell } from "@texturehq/edges-explore/layout";
import { type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type EntityTab, type ExploreRoute, ExplorerProvider, useExplorer } from "./ExplorerContext";
import { ExplorerMap, type MapOverlays, type MapRegion } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";

// ---------------------------------------------------------------------------
// SVG icons used in the filter bar
// ---------------------------------------------------------------------------

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Filter">
    <title>Filter</title>
    <path d="M22 3H2l8 9.46V19l4 2V12.46z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg
    width="10"
    height="6"
    viewBox="0 0 10 6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="Expand"
  >
    <title>Expand</title>
    <path d="M1 1l4 4 4-4" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="Check"
  >
    <title>Check</title>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// ---------------------------------------------------------------------------
// Region selector options for the map view
// ---------------------------------------------------------------------------

const REGION_OPTIONS: { value: MapRegion; label: string }[] = [
  { value: "utilities", label: "Utilities" },
  { value: "grid-operators", label: "Grid operators" },
  { value: "programs", label: "Programs" },
  { value: "pricing-nodes", label: "Pricing nodes" },
];

const OVERLAY_OPTIONS: { key: keyof MapOverlays; label: string }[] = [
  { key: "power-plants", label: "Power plants" },
  { key: "transmission-lines", label: "Transmission lines" },
  { key: "substations", label: "Substations" },
  { key: "ev-charging", label: "EV charging" },
  { key: "pricing-nodes", label: "Pricing nodes" },
];

const DEFAULT_MAP_OVERLAYS: MapOverlays = {
  "power-plants": true,
  "transmission-lines": true,
  substations: false,
  "ev-charging": false,
  "pricing-nodes": false,
};

const ENTITY_LABELS: Record<EntityTab, string> = {
  utilities: "Utilities",
  "grid-operators": "Grid Operators",
  "power-plants": "Power Plants",
  programs: "Programs",
  "transmission-lines": "Transmission",
  "ev-charging": "EV Charging",
  "pricing-nodes": "Pricing Nodes",
  substations: "Substations",
};

// ---------------------------------------------------------------------------
// Multi-select dropdown for overlays
// ---------------------------------------------------------------------------

function OverlayDropdown({
  overlays,
  onToggle,
}: {
  overlays: MapOverlays;
  onToggle: (key: keyof MapOverlays) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeCount = OVERLAY_OPTIONS.filter((o) => overlays[o.key]).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="cg-explore-icon-btn" onClick={() => setOpen(!open)} style={{ gap: 6 }}>
        + Points &amp; lines{activeCount > 0 ? ` (${activeCount})` : ""}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="cg-explore-dropdown">
          {OVERLAY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="cg-explore-dropdown-item"
              data-active={overlays[opt.key] || undefined}
              onClick={() => onToggle(opt.key)}
            >
              <span className="cg-explore-dropdown-check">{overlays[opt.key] && <CheckIcon />}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Region dropdown
// ---------------------------------------------------------------------------

function RegionDropdown({ value, onChange }: { value: MapRegion; onChange: (v: MapRegion) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const currentLabel = REGION_OPTIONS.find((o) => o.value === value)?.label ?? "Utilities";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="cg-explore-icon-btn"
        onClick={() => setOpen(!open)}
        style={{ gap: 6, fontWeight: 500 }}
      >
        {currentLabel}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="cg-explore-dropdown">
          {REGION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="cg-explore-dropdown-item"
              data-active={value === opt.value || undefined}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="cg-explore-dropdown-check">{value === opt.value && <CheckIcon />}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListSourceSelector — pinned to the top of the panel body in map mode
// ---------------------------------------------------------------------------

const VALID_MAP_REGIONS: MapRegion[] = ["utilities", "grid-operators", "programs", "pricing-nodes"];

function ListSourceSelector({
  mapRegion,
  mapOverlays,
  onMapRegionChange,
}: {
  mapRegion: MapRegion;
  mapOverlays: MapOverlays;
  onMapRegionChange?: (region: MapRegion) => void;
}) {
  const { state, setListSource, stack } = useExplorer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Active list-route tab — the tab the user navigated to. Always a valid
  // option here so the snap-back effect below never fights an in-flight
  // navigation (see the loop bug fixed in #311 for context).
  const activeListTab = useMemo<EntityTab | null>(() => {
    const currentList = stack.routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
    return currentList?.payload.tab ?? null;
  }, [stack.routes]);

  const options = useMemo<EntityTab[]>(() => {
    const seen = new Set<EntityTab>();
    const result: EntityTab[] = [];
    const addIfNew = (t: EntityTab) => {
      if (!seen.has(t)) {
        seen.add(t);
        result.push(t);
      }
    };
    // Include the navigated-to list tab first so it's always a valid
    // selection even before `mapRegion` / overlays have synced to it.
    // Without this, navigating to Programs / Grid Operators / Pricing
    // Nodes from the overview triggered an infinite ping-pong between
    // this component's snap-back effect and the ExplorerContext effect
    // that mirrors stack.list.tab → state.listSource.
    if (activeListTab) addIfNew(activeListTab);
    addIfNew(mapRegion as EntityTab);
    for (const opt of OVERLAY_OPTIONS) {
      if (mapOverlays[opt.key]) addIfNew(opt.key as EntityTab);
    }
    return result;
  }, [activeListTab, mapRegion, mapOverlays]);

  const activeSource: EntityTab = options.includes(state.listSource) ? state.listSource : (mapRegion as EntityTab);

  useEffect(() => {
    if (!options.includes(state.listSource)) {
      setListSource(mapRegion as EntityTab);
    }
  }, [options, state.listSource, mapRegion, setListSource]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-2 shrink-0"
      style={{
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Showing:</span>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          className="cg-explore-icon-btn"
          onClick={() => setOpen(!open)}
          style={{ gap: 6, fontWeight: 500 }}
        >
          {ENTITY_LABELS[activeSource]}
          <ChevronDownIcon />
        </button>
        {open && (
          <div className="cg-explore-dropdown">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className="cg-explore-dropdown-item"
                data-active={activeSource === opt || undefined}
                onClick={() => {
                  setListSource(opt);
                  if (onMapRegionChange && VALID_MAP_REGIONS.includes(opt as MapRegion)) {
                    onMapRegionChange(opt as MapRegion);
                  }
                  setOpen(false);
                }}
              >
                <span className="cg-explore-dropdown-check">{activeSource === opt && <CheckIcon />}</span>
                {ENTITY_LABELS[opt]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map layout — ExploreShell from @texturehq/edges-explore/layout owns the
// split/stacked switch, the floating "Open Overview" affordance, and the
// stacked-overlay slide animation. We just hand it the route stack, slot
// the existing top bar / map / panel children in, and let it run.
// ---------------------------------------------------------------------------

function getExploreRouteLabel(route: ExploreRoute): string | null {
  if (route.type === "overview") return "Overview";
  if (route.type === "list") return ENTITY_LABELS[route.payload.tab];
  return null;
}

interface MapLayoutProps {
  mapboxAccessToken?: string;
  mapRegion: MapRegion;
  mapOverlays: MapOverlays;
  onOverlayToggle?: (key: keyof MapOverlays) => void;
  onMapRegionChange?: (region: MapRegion) => void;
  topBar?: ReactNode;
}

function MapLayout({
  mapboxAccessToken,
  mapRegion,
  mapOverlays,
  onOverlayToggle,
  onMapRegionChange,
  topBar,
}: MapLayoutProps) {
  const { state, stack } = useExplorer();

  return (
    <ExploreShell<ExploreRoute>
      stack={stack}
      topBar={topBar}
      map={
        <ExplorerMap
          mapboxAccessToken={mapboxAccessToken}
          mapRegion={mapRegion}
          mapOverlays={mapOverlays}
          onOverlayToggle={onOverlayToggle}
        />
      }
      getRouteLabel={getExploreRouteLabel}
      homeRoute={{ type: "overview", id: "overview" }}
      homeRouteLabel="Open Overview"
      panelChildren={
        <>
          {stack.current?.type !== "overview" && (
            <ListSourceSelector mapRegion={mapRegion} mapOverlays={mapOverlays} onMapRegionChange={onMapRegionChange} />
          )}
          <ExplorerPanel listSource={state.listSource} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Map filter bar — region + overlays + filter (desktop top-bar row 2)
// ---------------------------------------------------------------------------

function MapFilterBar({
  mapRegion,
  setMapRegion,
  mapOverlays,
  toggleOverlay,
  onOpenFilter,
}: {
  mapRegion: MapRegion;
  setMapRegion: (r: MapRegion) => void;
  mapOverlays: MapOverlays;
  toggleOverlay: (key: keyof MapOverlays) => void;
  onOpenFilter?: () => void;
}) {
  return (
    <div className="cg-explore-filter-row">
      <RegionDropdown value={mapRegion} onChange={setMapRegion} />
      <div className="cg-explore-divider" />
      <OverlayDropdown overlays={mapOverlays} onToggle={toggleOverlay} />
      {onOpenFilter && (
        <>
          <div className="cg-explore-divider" />
          <button type="button" className="cg-explore-icon-btn" onClick={onOpenFilter}>
            <FilterIcon /> Filter
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout — ExploreShell owns everything below the filter bar. The Map/List
// mode toggle that used to live here is gone: switching between the map
// surface and an entity list happens inside the panel now (tap a bucket in
// the overview → push a list route).
// ---------------------------------------------------------------------------

interface ExplorerLayoutProps {
  mapboxAccessToken?: string;
}

function ExplorerLayout({ mapboxAccessToken }: ExplorerLayoutProps) {
  const { state, setListSource } = useExplorer();

  const [mapRegion, setMapRegion] = useState<MapRegion>("utilities");
  const handleMapRegionChange = useCallback(
    (region: MapRegion) => {
      setMapRegion(region);
      setListSource(region as EntityTab);
    },
    [setListSource]
  );

  const [mapOverlays, setMapOverlays] = useState<MapOverlays>(DEFAULT_MAP_OVERLAYS);
  const toggleOverlay = useCallback((key: keyof MapOverlays) => {
    setMapOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Reflect the active entity tab onto the map. Region-backed entities
  // (utilities / grid-operators / programs / pricing-nodes) switch the
  // fill region. Point/line overlays (power-plants, transmission-lines,
  // substations, ev-charging, pricing-nodes) get auto-enabled so markers
  // appear the instant the user picks the bucket from the overview — no
  // extra "+ Points & lines" toggle hunt required.
  useEffect(() => {
    const tab = state.listSource;
    if (VALID_MAP_REGIONS.includes(tab as MapRegion)) {
      setMapRegion(tab as MapRegion);
    } else {
      // Overlay-only tabs (power-plants, transmission-lines, etc.) don't
      // have their own fill region — reset to utilities so the map shows
      // territory polygons instead of stale grid/program boundaries.
      setMapRegion("utilities");
    }
    const overlayKeys: (keyof MapOverlays)[] = [
      "power-plants",
      "transmission-lines",
      "substations",
      "ev-charging",
      "pricing-nodes",
    ];
    if (overlayKeys.includes(tab as keyof MapOverlays)) {
      setMapOverlays((prev) => (prev[tab as keyof MapOverlays] ? prev : { ...prev, [tab as keyof MapOverlays]: true }));
    }
  }, [state.listSource]);

  const topBar = (
    <div className="cg-explore-filter-bar">
      <MapFilterBar
        mapRegion={mapRegion}
        setMapRegion={handleMapRegionChange}
        mapOverlays={mapOverlays}
        toggleOverlay={toggleOverlay}
      />
    </div>
  );

  return (
    <div className="cg-explore flex flex-col h-full overflow-hidden">
      <MapLayout
        mapboxAccessToken={mapboxAccessToken}
        mapRegion={mapRegion}
        mapOverlays={mapOverlays}
        onOverlayToggle={toggleOverlay}
        onMapRegionChange={setMapRegion}
        topBar={topBar}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

interface ExplorerShellProps {
  mapboxAccessToken?: string;
}

export function ExplorerShell({ mapboxAccessToken }: ExplorerShellProps = {}) {
  return (
    <Suspense>
      <ExplorerProvider>
        <ExplorerLayout mapboxAccessToken={mapboxAccessToken} />
      </ExplorerProvider>
    </Suspense>
  );
}
