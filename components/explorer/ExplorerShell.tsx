"use client";

import { SplitPane } from "@texturehq/edges";
import { Suspense, useState } from "react";
import { ExplorerProvider } from "./ExplorerContext";
import { ExplorerMap } from "./ExplorerMap";
import { ExplorerPanel } from "./ExplorerPanel";

function MobileToggle({
  showMap,
  onToggle,
}: {
  showMap: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-brand-primary text-white text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
    >
      {showMap ? "Show Panel" : "Show Map"}
    </button>
  );
}

interface ExplorerLayoutProps {
  mapboxAccessToken?: string;
}

function ExplorerLayout({ mapboxAccessToken }: ExplorerLayoutProps) {
  const [mobileShowMap, setMobileShowMap] = useState(false);

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:block h-full">
        <SplitPane asideWidth={540} resizable minAsideWidth={420} minMainWidth={400}>
          <SplitPane.Main>
            <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
          </SplitPane.Main>
          <SplitPane.Aside>
            <div className="h-full border-l border-border-default bg-background-surface">
              <ExplorerPanel />
            </div>
          </SplitPane.Aside>
        </SplitPane>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden h-full relative">
        {mobileShowMap ? (
          <ExplorerMap mapboxAccessToken={mapboxAccessToken} />
        ) : (
          <div className="h-full bg-background-surface">
            <ExplorerPanel />
          </div>
        )}
        <MobileToggle
          showMap={mobileShowMap}
          onToggle={() => setMobileShowMap((v) => !v)}
        />
      </div>
    </>
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
