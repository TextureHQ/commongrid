"use client";

import "@/app/(shell)/explore/explore.css";
import { ExploreShell } from "@texturehq/edges-explore/layout";
import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  type EntityTab,
  type ExploreRoute,
  ExplorerProvider,
  type ExploreViewMode,
  useExplorer,
} from "./ExplorerContext";
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

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Table">
    <title>Table</title>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Map">
    <title>Map</title>
    <path d="M9 20v-8M15 20v-8M3 10V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4M3 14v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M9 3v7M15 3v7M9 14v7M15 14v7" />
  </svg>
);

function MapTableToggle({ mode, setMode }: { mode: ExploreViewMode; setMode: (m: ExploreViewMode) => void }) {
  return (
    <div className="flex items-center bg-background-surface border border-border-default rounded-md p-0.5 ml-auto">
      <button
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
          mode === "map"
            ? "bg-brand-primary/10 text-brand-primary shadow-sm"
            : "text-text-muted hover:text-text-heading hover:bg-background-hover"
        }`}
        onClick={() => setMode("map")}
      >
        <MapIcon /> Map
      </button>
      <button
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
          mode === "table"
            ? "bg-brand-primary/10 text-brand-primary shadow-sm"
            : "text-text-muted hover:text-text-heading hover:bg-background-hover"
        }`}
        onClick={() => setMode("table")}
      >
        <ListIcon /> Table
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Region selector options for the map view
// ---------------------------------------------------------------------------

const REGION_OPTIONS: { value: MapRegion; label: string }[] = [
  { value: "utilities", label: "Utilities" },
  { value: "grid-operators", label: "Grid operators" },
  { value: "programs", label: "Programs" },
  { value: "rates", label: "Rates" },
  { value: "pricing-nodes", label: "Pricing nodes" },
  { value: "rates", label: "Rates" },
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
  rates: "Rates",
  "transmission-lines": "Transmission",
  "ev-charging": "EV Charging",
  "pricing-nodes": "Pricing Nodes",
  substations: "Substations",
  rates: "Rates",
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

const VALID_MAP_REGIONS: MapRegion[] = ["utilities", "grid-operators", "programs", "rates", "pricing-nodes"];

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
  topBar?: ReactNode;
}

function MapLayout({ mapboxAccessToken, mapRegion, mapOverlays, onOverlayToggle, topBar }: MapLayoutProps) {
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
      panelChildren={<ExplorerPanel listSource={state.listSource} />}
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
  viewMode,
  setViewMode,
}: {
  mapRegion: MapRegion;
  setMapRegion: (r: MapRegion) => void;
  mapOverlays: MapOverlays;
  toggleOverlay: (key: keyof MapOverlays) => void;
  onOpenFilter?: () => void;
  viewMode?: ExploreViewMode;
  setViewMode?: (m: ExploreViewMode) => void;
}) {
  return (
    <div className="cg-explore-filter-row w-full flex items-center">
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
      {viewMode && setViewMode && <MapTableToggle mode={viewMode} setMode={setViewMode} />}
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
  const { state, setListSource, setViewMode } = useExplorer();

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
    <div className="cg-explore-filter-bar flex w-full">
      <MapFilterBar
        mapRegion={mapRegion}
        setMapRegion={handleMapRegionChange}
        mapOverlays={mapOverlays}
        toggleOverlay={toggleOverlay}
        viewMode={state.viewMode}
        setViewMode={setViewMode}
      />
    </div>
  );

  return (
    <div className="cg-explore flex flex-col h-full overflow-hidden">
      {state.viewMode === "map" ? (
        <MapLayout
          mapboxAccessToken={mapboxAccessToken}
          mapRegion={mapRegion}
          mapOverlays={mapOverlays}
          onOverlayToggle={toggleOverlay}
          topBar={topBar}
        />
      ) : (
        <div className="flex flex-col h-full bg-background-body">
          {topBar}
          <div className="flex-1 overflow-auto bg-background-body">
            <ExplorerPanel listSource={state.listSource} forceTable />
          </div>
        </div>
      )}
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
