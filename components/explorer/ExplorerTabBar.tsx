"use client";

import { type EntityTab, useExplorer } from "./ExplorerContext";

interface TabDef {
  id: EntityTab;
  label: string;
  color: string;
  dotShape: "square" | "circle" | "line";
}

const TABS: TabDef[] = [
  { id: "utilities", label: "Utilities", color: "var(--cg-teal)", dotShape: "square" },
  { id: "grid-operators", label: "Grid Operators", color: "var(--cg-blue)", dotShape: "square" },
  { id: "power-plants", label: "Power Plants", color: "var(--color-brand-primary)", dotShape: "circle" },
  { id: "programs", label: "Programs", color: "var(--cg-purple)", dotShape: "square" },
  { id: "transmission-lines", label: "Transmission", color: "var(--color-text-muted)", dotShape: "line" },
  { id: "substations", label: "Substations", color: "var(--cg-copper)", dotShape: "square" },
  { id: "ev-charging", label: "EV Charging", color: "var(--cg-lime)", dotShape: "circle" },
  { id: "pricing-nodes", label: "Pricing Nodes", color: "var(--cg-amber)", dotShape: "circle" },
];

export function ExplorerTabBar() {
  const { state, navigateToTab } = useExplorer();

  return (
    <div className="cg-explore-tabs">
      {TABS.map((tab) => {
        const isActive = state.tab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className="cg-explore-tab"
            data-active={isActive}
            style={{
              borderBottomColor: isActive ? tab.color : "transparent",
              color: isActive ? tab.color : undefined,
            }}
            onClick={() => navigateToTab(tab.id)}
          >
            <span className="cg-explore-tab-dot" data-shape={tab.dotShape} style={{ background: tab.color }} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
