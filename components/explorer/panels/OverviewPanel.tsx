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
 * Mirrors the design pattern in apps/dashboard's OverviewRoute, adapted
 * to CommonGrid's entity model (no alerts section, no per-variant device
 * buckets).
 */

import { useEntityCounts } from "@/hooks/useEntityCounts";
import { type EntityTab, useExplorer } from "../ExplorerContext";

const CaretRightIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden
    focusable="false"
  >
    <path d="M6 4l4 4-4 4" />
  </svg>
);

interface BucketSpec {
  tab: EntityTab;
  label: string;
  /** Optional accent dot color. CSS var; falls back to a neutral if missing. */
  accentColor?: string;
}

// Ordering matches the existing ExplorerTabBar for consistency.
const BUCKETS: BucketSpec[] = [
  { tab: "utilities", label: "Utilities", accentColor: "var(--cg-utility-accent, var(--color-text-secondary))" },
  {
    tab: "grid-operators",
    label: "Grid Operators",
    accentColor: "var(--cg-grid-operator-accent, var(--color-text-secondary))",
  },
  {
    tab: "power-plants",
    label: "Power Plants",
    accentColor: "var(--cg-power-plant-accent, var(--color-text-secondary))",
  },
  { tab: "programs", label: "Programs", accentColor: "var(--cg-program-accent, var(--color-text-secondary))" },
  {
    tab: "transmission-lines",
    label: "Transmission Lines",
    accentColor: "var(--cg-transmission-accent, var(--color-text-secondary))",
  },
  {
    tab: "ev-charging",
    label: "EV Charging",
    accentColor: "var(--cg-ev-charging-accent, var(--color-text-secondary))",
  },
  {
    tab: "pricing-nodes",
    label: "Pricing Nodes",
    accentColor: "var(--cg-pricing-node-accent, var(--color-text-secondary))",
  },
  { tab: "substations", label: "Substations", accentColor: "var(--cg-substation-accent, var(--color-text-secondary))" },
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
      {BUCKETS.map(({ tab, label, accentColor }) => (
        <BucketRow
          key={tab}
          label={label}
          accentColor={accentColor}
          count={bucketCount(counts, tab)}
          onSelect={() => navigateToTab(tab)}
        />
      ))}
    </div>
  );
}

interface BucketRowProps {
  label: string;
  accentColor: string | undefined;
  count: number | null;
  onSelect: () => void;
}

function BucketRow({ label, accentColor, count, onSelect }: BucketRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-background-hover"
      style={{ borderBottom: "1px solid var(--color-border-subtle, var(--color-border-default))" }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: accentColor ?? "currentColor" }}
      />
      <span className="flex-1 truncate text-sm" style={{ color: "var(--color-text-default)" }}>
        {label}
      </span>
      <span
        className="font-semibold text-sm tabular-nums"
        style={{ color: count == null ? "var(--color-text-muted)" : "var(--color-text-default)" }}
      >
        {count == null ? "—" : count.toLocaleString()}
      </span>
      <span style={{ color: "var(--color-text-secondary)" }}>
        <CaretRightIcon />
      </span>
    </button>
  );
}
