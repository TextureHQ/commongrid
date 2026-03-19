"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ExplorerProvider } from "./ExplorerContext";
import { ExplorerMap } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";
import { ExplorerTabBar } from "./ExplorerTabBar";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { useExplorer } from "./ExplorerContext";

// ---------------------------------------------------------------------------
// Manual resizable split — panel LEFT, map RIGHT (desktop only)
// Supports both mouse and touch for the resize handle.
// ---------------------------------------------------------------------------

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 380;
const MIN_MAP_WIDTH = 400;

interface HybridLayoutProps {
  mapboxAccessToken?: string;
}

function HybridLayout({ mapboxAccessToken }: HybridLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Mouse drag ----
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const containerWidth = containerRef.current.offsetWidth;
      const newWidth = ev.clientX - containerLeft;
      const clamped = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(newWidth, containerWidth - MIN_MAP_WIDTH)
      );
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

  // ---- Touch drag ----
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onTouchMove = (ev: TouchEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const touch = ev.touches[0];
      if (!touch) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const containerWidth = containerRef.current.offsetWidth;
      const newWidth = touch.clientX - containerLeft;
      const clamped = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(newWidth, containerWidth - MIN_MAP_WIDTH)
      );
      setPanelWidth(clamped);
    };

    const onTouchEnd = () => {
      dragging.current = false;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  }, []);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Panel — LEFT */}
      <div
        className="flex-none h-full overflow-hidden border-r border-border-default bg-background-surface"
        style={{ width: panelWidth }}
      >
        <ExplorerPanel />
      </div>

      {/* Resize handle — wider touch target, supports both mouse and touch */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="flex-none w-1 h-full cursor-col-resize hover:bg-brand-primary/30 active:bg-brand-primary/50 transition-colors z-10 touch-none"
        aria-hidden="true"
      />

      {/* Map — RIGHT */}
      <div className="flex-1 min-w-0 h-full">
        <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile map/list toggle pill — floats above map content
// ---------------------------------------------------------------------------

function MobileViewToggle() {
  const { state, setLayout } = useExplorer();
  const { layout } = state;
  const isMap = layout === "map";

  return (
    <button
      type="button"
      onClick={() => setLayout(isMap ? "hybrid" : "map")}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-foreground text-background text-sm font-medium shadow-lg active:scale-95 transition-transform select-none"
      aria-label={isMap ? "Show list" : "Show map"}
    >
      {isMap ? (
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
  );
}

function MapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path fillRule="evenodd" d="M8.914 6.025a.75.75 0 0 1 1.06 0 3.5 3.5 0 0 1 0 4.95l-2 2a3.5 3.5 0 0 1-5.396-4.402.75.75 0 0 1 1.251.827 2 2 0 0 0 3.085 2.514l2-2a2 2 0 0 0 0-2.828.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M7.086 9.975a.75.75 0 0 1-1.06 0 3.5 3.5 0 0 1 0-4.95l2-2a3.5 3.5 0 0 1 5.396 4.402.75.75 0 0 1-1.251-.827 2 2 0 0 0-3.085-2.514l-2 2a2 2 0 0 0 0 2.828.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface ExplorerLayoutProps {
  mapboxAccessToken?: string;
}

function ExplorerLayout({ mapboxAccessToken }: ExplorerLayoutProps) {
  const { state, setLayout } = useExplorer();
  const { layout } = state;

  // On mobile, default to map view. We detect via matchMedia so SSR is
  // unaffected (layout starts as "hybrid" from the context initialState).
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile && layout === "hybrid") {
      setLayout("map");
    }
    // Only run once on mount — intentionally omit `layout` from deps so
    // a user-triggered layout change is not overridden on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLayout]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Desktop: tab bar + toolbar in one row */}
      <div className="hidden md:flex items-center justify-between border-b border-border-default bg-background-surface flex-none">
        <ExplorerTabBar />
        <ExplorerToolbar />
      </div>

      {/* Mobile: entity tab bar (scrollable) */}
      <div className="md:hidden flex-none border-b border-border-default bg-background-surface">
        <ExplorerTabBar />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {/* ── Desktop layouts ── */}
        <div className="hidden md:block h-full">
          {layout === "hybrid" && (
            <HybridLayout mapboxAccessToken={mapboxAccessToken} />
          )}
          {layout === "list" && (
            <div className="h-full bg-background-surface">
              <ExplorerPanel />
            </div>
          )}
          {layout === "map" && (
            <div className="h-full">
              <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
            </div>
          )}
        </div>

        {/* ── Mobile layouts ── */}
        {/* Map is always rendered (hidden when not active) so it doesn't
            remount and lose viewport position when toggling back. */}
        <div className="md:hidden h-full relative">
          {/* Map layer — visible when layout === "map" */}
          <div className={layout === "map" ? "h-full" : "hidden"}>
            <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
          </div>

          {/* List/panel layer — visible when layout !== "map" */}
          <div className={layout !== "map" ? "h-full overflow-y-auto bg-background-surface" : "hidden"}>
            <ExplorerPanel />
          </div>

          {/* Floating map/list toggle pill */}
          <MobileViewToggle />
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
