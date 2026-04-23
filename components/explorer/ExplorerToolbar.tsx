"use client";

import { type LayoutMode, useExplorer } from "./ExplorerContext";

const VIEW_OPTIONS: { id: LayoutMode; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "hybrid", label: "Hybrid" },
  { id: "list", label: "List" },
];

export function ExplorerToolbar() {
  const { state, setLayout } = useExplorer();

  return (
    <div className="cg-explore-view-toggle">
      {VIEW_OPTIONS.map((v) => (
        <button key={v.id} type="button" data-active={state.layout === v.id} onClick={() => setLayout(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}
