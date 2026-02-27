"use client";

import { SplitPane } from "@texturehq/edges";
import { Suspense } from "react";
import { ExplorerProvider } from "./ExplorerContext";
import { ExplorerMap } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";
import { ExplorerTabBar } from "./ExplorerTabBar";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { useExplorer } from "./ExplorerContext";

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

      {/* Mobile: just tab bar (toolbar is inline in panel) */}
      <div className="md:hidden flex-none border-b border-border-default bg-background-surface">
        <ExplorerTabBar />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {/* Desktop layouts */}
        <div className="hidden md:block h-full">
          {layout === "hybrid" && (
            <SplitPane
              asideWidth={540}
              resizable
              minAsideWidth={420}
              minMainWidth={400}
            >
              <SplitPane.Main>
                <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
              </SplitPane.Main>
              <SplitPane.Aside>
                <div className="h-full border-l border-border-default bg-background-surface">
                  <ExplorerPanel />
                </div>
              </SplitPane.Aside>
            </SplitPane>
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

        {/* Mobile layouts */}
        <div className="md:hidden h-full relative">
          {layout === "map" ? (
            <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
          ) : (
            <div className="h-full bg-background-surface">
              <ExplorerPanel />
            </div>
          )}
          {/* Mobile Map/List toggle button */}
          <button
            type="button"
            onClick={() => setLayout(layout === "map" ? "hybrid" : "map")}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-primary text-white text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
          >
            {layout === "map" ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                    clipRule="evenodd"
                  />
                </svg>
                Show List
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 0C5.68 0 3.5 1.5 2.4 3.6L1 4l1.4.4C2.5 5.4 2 6.7 2 8c0 3.31 2.69 6 6 6s6-2.69 6-6-2.69-6-6-6ZM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
                    clipRule="evenodd"
                  />
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
