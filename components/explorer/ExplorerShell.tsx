"use client";

import "@/app/(shell)/explore/explore.css";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type EntityTab, ExplorerProvider, useExplorer } from "./ExplorerContext";
import { ExplorerMap, type MapOverlays, type MapRegion } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";
import { ExplorerTabBar } from "./ExplorerTabBar";
import { ExplorerToolbar } from "./ExplorerToolbar";

// ---------------------------------------------------------------------------
// SVG icons used in the filter bar
// ---------------------------------------------------------------------------

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 3H2l8 9.46V19l4 2V12.46z" />
  </svg>
);

const ExportIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3" />
  </svg>
);

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
      clipRule="evenodd"
    />
  </svg>
);

const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M5.37 1.482a.75.75 0 0 1 .476.058L10.5 3.442l3.654-1.827A.75.75 0 0 1 15.25 2.3v9.75a.75.75 0 0 1-.404.666l-4.25 2.125a.75.75 0 0 1-.596.018L5.5 12.56l-3.654 1.826A.75.75 0 0 1 .75 13.7V3.95a.75.75 0 0 1 .404-.666l4.25-2.125a.75.75 0 0 1-.034.323Z"
      clipRule="evenodd"
    />
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
  >
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
  >
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

// ---------------------------------------------------------------------------
// Points & lines overlay options for the map view
// ---------------------------------------------------------------------------

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

// Labels for entity tabs — used by ListSourceSelector
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
              data-active={overlays[opt.key]}
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
// Region dropdown (custom, matching prototype style)
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
              data-active={value === opt.value}
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
// ListSourceSelector — shown at top of list panel in map view
// Controls which entity type populates the panel list
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
  const { state, setListSource } = useExplorer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Build ordered options: region first, then active overlays (deduped)
  const options = useMemo<EntityTab[]>(() => {
    const seen = new Set<EntityTab>();
    const result: EntityTab[] = [];
    const addIfNew = (t: EntityTab) => {
      if (!seen.has(t)) {
        seen.add(t);
        result.push(t);
      }
    };
    addIfNew(mapRegion as EntityTab);
    for (const opt of OVERLAY_OPTIONS) {
      if (mapOverlays[opt.key]) addIfNew(opt.key as EntityTab);
    }
    return result;
  }, [mapRegion, mapOverlays]);

  // If current listSource was toggled off, fall back to mapRegion
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-border-default)",
        flexShrink: 0,
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
                data-active={activeSource === opt}
                onClick={() => {
                  setListSource(opt);
                  // Sync map region when list source changes to a valid map region
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
// Manual resizable split — panel LEFT, map RIGHT (the "map" layout)
// ---------------------------------------------------------------------------

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 380;
const MIN_MAP_WIDTH = 400;

interface MapLayoutProps {
  mapboxAccessToken?: string;
  mapRegion: MapRegion;
  mapOverlays: MapOverlays;
  onOverlayToggle?: (key: keyof MapOverlays) => void;
  onMapRegionChange?: (region: MapRegion) => void;
}

function MapLayout({ mapboxAccessToken, mapRegion, mapOverlays, onOverlayToggle, onMapRegionChange }: MapLayoutProps) {
  const { state } = useExplorer();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const containerWidth = containerRef.current.offsetWidth;
      const newWidth = ev.clientX - containerLeft;
      const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, containerWidth - MIN_MAP_WIDTH));
      setPanelWidth(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Panel — LEFT */}
      <div
        className="flex-none h-full overflow-hidden flex flex-col"
        style={{
          width: panelWidth,
          borderRight: "1px solid var(--color-border-default)",
          background: "var(--color-background-surface)",
        }}
      >
        <ListSourceSelector mapRegion={mapRegion} mapOverlays={mapOverlays} onMapRegionChange={onMapRegionChange} />
        <ExplorerPanel listSource={state.listSource} />
      </div>

      {/* Resize handle */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-resize handle */}
      <div className="cg-explore-resize-handle" onMouseDown={onMouseDown} />

      {/* Map — RIGHT */}
      <div className="flex-1 min-w-0 h-full">
        <ExplorerMap
          mapboxAccessToken={mapboxAccessToken}
          mapRegion={mapRegion}
          mapOverlays={mapOverlays}
          onOverlayToggle={onOverlayToggle}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map Filter Bar — region + overlays + filter
// ---------------------------------------------------------------------------

function MapFilterBar({
  mapRegion,
  setMapRegion,
  mapOverlays,
  toggleOverlay,
}: {
  mapRegion: MapRegion;
  setMapRegion: (r: MapRegion) => void;
  mapOverlays: MapOverlays;
  toggleOverlay: (key: keyof MapOverlays) => void;
}) {
  return (
    <div className="cg-explore-filter-row">
      <RegionDropdown value={mapRegion} onChange={setMapRegion} />
      <div className="cg-explore-divider" />
      <OverlayDropdown overlays={mapOverlays} onToggle={toggleOverlay} />
      <div className="cg-explore-divider" />
      <button type="button" className="cg-explore-icon-btn">
        <FilterIcon /> Filter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List Filter Bar
// ---------------------------------------------------------------------------

function ListFilterBar() {
  return (
    <div className="cg-explore-sub-bar">
      <button type="button" className="cg-explore-icon-btn">
        <FilterIcon /> Filter
      </button>
      <button type="button" className="cg-explore-icon-btn">
        Sort ↕
      </button>
      <div className="cg-explore-divider" />
      <button type="button" className="cg-explore-icon-btn" style={{ marginLeft: "auto" }}>
        <ExportIcon /> Export
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface ExplorerLayoutProps {
  mapboxAccessToken?: string;
}

function ExplorerLayout({ mapboxAccessToken }: ExplorerLayoutProps) {
  const { state, setLayout, setListSource } = useExplorer();
  const { layout } = state;

  // Map-specific state: region layer + overlay toggles
  const [mapRegion, setMapRegion] = useState<MapRegion>("utilities");

  // Sync listSource when mapRegion changes via the Region dropdown
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

  return (
    <div className="cg-explore flex flex-col h-full overflow-hidden">
      {/* Desktop: filter bar */}
      <div className="hidden md:flex flex-col" style={{ flexShrink: 0 }}>
        <div className="cg-explore-filter-bar">
          {/* Row 1: view toggle */}
          <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
            <ExplorerToolbar />
          </div>

          {/* Row 2 (map view): region + overlays + filter */}
          {layout === "map" && (
            <MapFilterBar
              mapRegion={mapRegion}
              setMapRegion={handleMapRegionChange}
              mapOverlays={mapOverlays}
              toggleOverlay={toggleOverlay}
            />
          )}

          {/* Row 2 (list view): entity tabs + list filter bar */}
          {layout === "list" && (
            <>
              <div style={{ borderTop: "1px solid var(--color-border-default)" }}>
                <ExplorerTabBar />
              </div>
              <ListFilterBar />
            </>
          )}
        </div>
      </div>

      {/* Mobile: simplified tab bar (list view only) + floating toggle */}
      {layout === "list" && (
        <div
          className="md:hidden"
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--color-border-default)",
            background: "var(--color-background-surface)",
          }}
        >
          <ExplorerTabBar />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {/* Desktop layouts */}
        <div className="hidden md:block h-full">
          {layout === "map" && (
            <MapLayout
              mapboxAccessToken={mapboxAccessToken}
              mapRegion={mapRegion}
              mapOverlays={mapOverlays}
              onOverlayToggle={toggleOverlay}
              onMapRegionChange={setMapRegion}
            />
          )}
          {layout === "list" && (
            <div className="h-full" style={{ background: "var(--color-background-surface)" }}>
              <ExplorerPanel />
            </div>
          )}
        </div>

        {/* Mobile layouts */}
        <div className="md:hidden h-full relative">
          {layout === "map" ? (
            <ExplorerMap
              mapboxAccessToken={mapboxAccessToken}
              mapRegion={mapRegion}
              mapOverlays={mapOverlays}
              onOverlayToggle={toggleOverlay}
            />
          ) : (
            <div className="h-full" style={{ background: "var(--color-background-surface)" }}>
              <ExplorerPanel />
            </div>
          )}
          {/* Floating toggle button */}
          <button
            type="button"
            onClick={() => setLayout(layout === "map" ? "list" : "map")}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium shadow-lg"
            style={{
              background: "var(--color-text-heading)",
              color: "#fff",
            }}
          >
            {layout === "map" ? (
              <>
                <ListIcon />
                Show List
              </>
            ) : (
              <>
                <MapIcon />
                Show Map
              </>
            )}
          </button>
        </div>
      </div>
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
