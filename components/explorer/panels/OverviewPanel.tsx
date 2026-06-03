"use client";

/**
 * OverviewPanel — top-level surface of the right-edge explore panel.
 *
 * Renders a vertical list of entity-type rows (utilities, grid operators,
 * power plants, etc.). Each row shows the entity label and a live count
 * pulled from the same list hooks that drive each tab's list panel —
 * counts agree across surfaces because they share a source.
 *
 * Clicking a row pushes the matching list route, taking the user from
 * `[overview]` to `[overview, list(tab)]`. From there the existing list
 * → detail flow takes over.
 *
 * Visual chrome (accent dot, label, count, chevron) is owned by
 * `PanelBucketRow` from `@texturehq/edges-explore/panel-atoms` — CommonGrid
 * supplies just the data and the onSelect handler.
 */

import { PanelBucketRow } from "@texturehq/edges-explore/panel-atoms";
import { useEntityCounts } from "@/hooks/useEntityCounts";
import { entityKindColor } from "@/lib/categorical-colors";
import { type EntityTab, useExplorer } from "../ExplorerContext";

interface BucketSpec {
  tab: EntityTab;
  label: string;
}

const BUCKETS: BucketSpec[] = [
  { tab: "utilities", label: "Utilities" },
  { tab: "grid-operators", label: "Grid Operators" },
  { tab: "power-plants", label: "Power Plants" },
  { tab: "programs", label: "Programs" },
  { tab: "transmission-lines", label: "Transmission Lines" },
  { tab: "ev-charging", label: "EV Charging" },
  { tab: "pricing-nodes", label: "Pricing Nodes" },
  { tab: "substations", label: "Substations" },
];

/**
 * Map each overview bucket to its slot in the homepage's `useEntityCounts`
 * shape. Grid operators are the sum of ISOs + RTOs + BAs; the homepage
 * does the same aggregation in its "Markets" card.
 */
function bucketCount(counts: ReturnType<typeof useEntityCounts>, tab: EntityTab): number | null {
  switch (tab) {
    case "utilities":
      return counts.utilities;
    case "grid-operators": {
      const parts = [counts.isos, counts.rtos, counts.balancingAuthorities];
      // Show the running total even if some sub-counts are still loading.
      if (parts.every((p) => p === null)) return null;
      return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
    }
    case "power-plants":
      return counts.powerPlants;
    case "programs":
      return counts.programs;
    case "transmission-lines":
      return counts.transmissionLines;
    case "ev-charging":
      return counts.evStations;
    case "pricing-nodes":
      return counts.pricingNodes;
    case "substations":
      return counts.substations;
  }
}

export function OverviewPanel() {
  const { navigateToTab } = useExplorer();
  const counts = useEntityCounts();

  return (
    <div className="flex flex-col">
      {BUCKETS.map(({ tab, label }) => {
        const count = bucketCount(counts, tab);
        return (
          <PanelBucketRow
            key={tab}
            label={label}
            accentColor={entityKindColor(tab)}
            count={count}
            loading={count === null}
            onSelect={() => navigateToTab(tab)}
          />
        );
      })}
    </div>
  );
}
