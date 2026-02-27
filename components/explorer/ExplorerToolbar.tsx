"use client";

import { SegmentedControl, type SegmentOption } from "@texturehq/edges";
import { useExplorer, type LayoutMode } from "./ExplorerContext";

const OPTIONS: SegmentOption[] = [
  { id: "map", label: "Map" },
  { id: "list", label: "List" },
  { id: "hybrid", label: "Hybrid" },
];

export function ExplorerToolbar() {
  const { state, setLayout } = useExplorer();

  return (
    <div className="flex items-center px-4 py-2 flex-shrink-0">
      <SegmentedControl
        options={OPTIONS}
        value={state.layout}
        onChange={(value) => setLayout(value as LayoutMode)}
        size="sm"
        aria-label="View layout"
      />
    </div>
  );
}
