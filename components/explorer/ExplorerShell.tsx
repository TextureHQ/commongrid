"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { ExplorerProvider } from "./ExplorerContext";
import { ExplorerMap } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";
import { ExplorerTabBar } from "./ExplorerTabBar";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { useExplorer } from "./ExplorerContext";

// ---------------------------------------------------------------------------
// Manual resizable split — panel LEFT, map RIGHT
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

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Panel — LEFT */}
      <div
        className="flex-none h-full overflow-hidden border-r border-border-default bg-background-surface"
        style={{ width: panelWidth }}
      >
        <ExplorerPanel />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="flex-none w-1 h-full cursor-col-resize hover:bg-brand-primary/30 active:bg-brand-primary/50 transition-colors z-10"
      />

      {/* Map — RIGHT */}
      <div className="flex-1 min-w-0 h-full">
        <ExplorerMap key="hybrid" mapboxAccessToken={mapboxAccessToken} />
      </div>
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
  const { state, setLayout } = useExplorer();
  const { layout } = state;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Desktop: tab bar + toolbar in one row */}
      <div className="hidden md:flex items-center justify-between border-b border-border-default bg-background-surface flex-none">
        <ExplorerTabBar />
        <ExplorerToolbar />
      </div>

      {/* Mobile: just tab bar */}
      <div className="md:hidden flex-none border-b border-border-default bg-background-surface">
        <ExplorerTabBar />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {/* Desktop layouts */}
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
              <ExplorerMap key={layout} mapboxAccessToken={mapboxAccessToken} />
            </div>
          )}
        </div>

        {/* Mobile layouts */}
        <div className="md:hidden h-full relative">
          {layout === "map" ? (
            <ExplorerMap key={layout} mapboxAccessToken={mapboxAccessToken} />
          ) : (
            <div className="h-full bg-background-surface">
              <ExplorerPanel />
            </div>
          )}
          {/* Floating toggle button */}
          <button
            type="button"
            onClick={() => setLayout(layout === "map" ? "hybrid" : "map")}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-primary text-white text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
          >
            {layout === "map" ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                </svg>
                Show List
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.438l-3.136 2.556a.75.75 0 0 1-1.12-.814l.853-3.575-2.79-2.39a.75.75 0 0 1 .427-1.317l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                </svg>
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
