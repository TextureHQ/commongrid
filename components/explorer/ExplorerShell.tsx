"use client";

import "@/app/(shell)/explore/explore.css";
import { ExploreShell } from "@texturehq/edges-explore/layout";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { type EntityTab, type ExploreRoute, ExplorerProvider, useExplorer, type ViewMode } from "./ExplorerContext";
import { ExplorerMap, type MapOverlays, type MapRegion } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";

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

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="cg-explore-view-toggle" role="tablist" aria-label="Explorer view mode">
      <button type="button" data-active={value === "map" || undefined} onClick={() => onChange("map")}>
        Map
      </button>
      <button type="button" data-active={value === "table" || undefined} onClick={() => onChange("table")}>
        Table
      </button>
    </div>
  );
}

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

const VALID_MAP_REGIONS: MapRegion[] = ["utilities", "grid-operators", "programs", "pricing-nodes"];

function getExploreRouteLabel(route: ExploreRoute): string | null {
  if (route.type === "overview") return "Overview";
  if (route.type === "list") return ENTITY_LABELS[route.payload.tab];
  return null;
}

function MapFilterBar({
  mapRegion,
  setMapRegion,
  mapOverlays,
  toggleOverlay,
  viewMode,
  setViewMode,
  showViewModeToggle,
  onOpenFilter,
}: {
  mapRegion: MapRegion;
  setMapRegion: (r: MapRegion) => void;
  mapOverlays: MapOverlays;
  toggleOverlay: (key: keyof MapOverlays) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showViewModeToggle: boolean;
  onOpenFilter?: () => void;
}) {
  return (
    <div className="cg-explore-filter-row">
      <RegionDropdown value={mapRegion} onChange={setMapRegion} />
      <div className="cg-explore-divider" />
      <OverlayDropdown overlays={mapOverlays} onToggle={toggleOverlay} />
      {showViewModeToggle && (
        <>
          <div className="cg-explore-divider" />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </>
      )}
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

function ExplorerLayout({ mapboxAccessToken }: { mapboxAccessToken?: string }) {
  const { state, stack, setListSource, setViewMode } = useExplorer();

  const [mapRegion, setMapRegion] = useState<MapRegion>("utilities");
  const [mapOverlays, setMapOverlays] = useState<MapOverlays>(DEFAULT_MAP_OVERLAYS);

  const handleMapRegionChange = useCallback(
    (region: MapRegion) => {
      setMapRegion(region);
      setListSource(region as EntityTab);
    },
    [setListSource]
  );

  const toggleOverlay = useCallback((key: keyof MapOverlays) => {
    setMapOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    const tab = state.listSource;
    if (VALID_MAP_REGIONS.includes(tab as MapRegion)) {
      setMapRegion(tab as MapRegion);
    } else {
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
        viewMode={state.viewMode}
        setViewMode={setViewMode}
        showViewModeToggle={state.mode === "list"}
      />
    </div>
  );

  const panelChildren = <ExplorerPanel listSource={state.listSource} />;
  const isTableMode = state.viewMode === "table";

  return (
    <div className="cg-explore flex flex-col h-full overflow-hidden">
      <ExploreShell<ExploreRoute>
        stack={stack}
        topBar={topBar}
        map={
          isTableMode ? (
            <div className="h-full w-full bg-background-surface" />
          ) : (
            <ExplorerMap
              mapboxAccessToken={mapboxAccessToken}
              mapRegion={mapRegion}
              mapOverlays={mapOverlays}
              onOverlayToggle={toggleOverlay}
            />
          )
        }
        getRouteLabel={getExploreRouteLabel}
        homeRoute={isTableMode ? undefined : { type: "overview", id: "overview" }}
        homeRouteLabel="Open Overview"
        panelChildren={panelChildren}
        layout={isTableMode ? "stacked" : undefined}
      />
    </div>
  );
}

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
