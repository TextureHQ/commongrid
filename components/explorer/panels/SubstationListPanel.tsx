"use client";

/**
 * SubstationListPanel — Explorer panel for substations.
 *
 * Server-side search + cursor pagination via `useInfiniteList`. Previously
 * paginated via a manual fetch + button-only Load More; this rewrite
 * unifies with the other overlay panels and adds intersection-based
 * auto-load. Substations are ~60k+ rows, so server-side pagination has
 * always been required here.
 *
 * Voltage-band filtering is applied client-side because the API exposes
 * `minMaxVoltageKv` rather than a band enum.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { voltageColor } from "@/lib/categorical-colors";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoltageBand = "extra-high" | "high" | "medium" | "sub-trans" | "unknown";
type SubstationType = "transmission" | "distribution" | "hybrid" | "unknown";
type SubstationStatus = "in_service" | "out_of_service" | "planned" | "retired" | "unknown";

interface SubstationApiRow {
  id: string;
  slug: string;
  name: string;
  ownerName: string | null;
  state: string;
  county: string | null;
  latitude: number;
  longitude: number;
  minVoltageKv: number | null;
  maxVoltageKv: number | null;
  voltageBand: VoltageBand;
  substationType: SubstationType;
  status: SubstationStatus;
  source: string;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const VOLTAGE_BAND_LABELS: Record<VoltageBand, string> = {
  "extra-high": "345kV+",
  high: "230–344kV",
  medium: "115–229kV",
  "sub-trans": "69–114kV",
  unknown: "Unknown",
};

const SUBSTATION_TYPE_LABELS: Record<SubstationType, string> = {
  transmission: "Transmission",
  distribution: "Distribution",
  hybrid: "Hybrid",
  unknown: "Unknown",
};

function formatVoltage(row: SubstationApiRow): string {
  const { minVoltageKv, maxVoltageKv } = row;
  if (minVoltageKv != null && maxVoltageKv != null) {
    if (minVoltageKv === maxVoltageKv) return `${maxVoltageKv} kV`;
    return `${minVoltageKv}–${maxVoltageKv} kV`;
  }
  if (maxVoltageKv != null) return `${maxVoltageKv} kV`;
  if (minVoltageKv != null) return `${minVoltageKv} kV`;
  return "—";
}

function getVoltageBandColor(band: VoltageBand): string {
  switch (band) {
    case "extra-high":
      return voltageColor("extra-high");
    case "high":
      return voltageColor("high");
    case "medium":
      return voltageColor("medium");
    case "sub-trans":
      return voltageColor("subtrans");
    default:
      return voltageColor("unknown");
  }
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const VOLTAGE_BAND_FILTERS = [
  { id: "all", label: "All Voltages", value: "all" },
  { id: "extra-high", label: "Extra High (345kV+)", value: "extra-high" },
  { id: "high", label: "High (230–344kV)", value: "high" },
  { id: "medium", label: "Medium (115–229kV)", value: "medium" },
  { id: "sub-trans", label: "Sub-Transmission (69–114kV)", value: "sub-trans" },
  { id: "unknown", label: "Unknown Voltage", value: "unknown" },
];

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SubstationListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const params = useMemo(
    () => ({
      search: state.q,
      sort: "name",
      order: "asc" as const,
    }),
    [state.q]
  );

  const { items, total, hasMore, isLoading, isFetching, isLoadingMore, error, sentinelRef, loadMore } =
    useInfiniteList<SubstationApiRow>({
      endpoint: "/api/v1/substations",
      params,
    });

  // Voltage-band filter applied client-side because the API doesn't expose a
  // band enum on the query schema.
  const bandFilter = state.type && state.type !== "all" ? (state.type as VoltageBand) : null;
  const visibleRows = useMemo(() => {
    if (!bandFilter) return items;
    return items.filter((r) => r.voltageBand === bandFilter);
  }, [items, bandFilter]);

  const handleRowClick = useCallback(
    (slug: string) => {
      router.push(`/substations/${slug}`);
    },
    [router]
  );

  return (
    <InfiniteListShell
      entityLabel="substations"
      total={total}
      isLoading={isLoading}
      isFetching={isFetching}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      sentinelRef={sentinelRef}
      loadMore={loadMore}
      visibleCount={visibleRows.length}
      searchValue={state.q}
      onSearchChange={setSearch}
      searchPlaceholder="Search substations, owners, states…"
      filterOptions={VOLTAGE_BAND_FILTERS}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "Full list →",
        onClick: () => router.push("/substations"),
        visible: !!user,
      }}
      hasActiveFilter={!!bandFilter}
    >
      {visibleRows.map((row) => (
        <PanelEntityRow
          key={row.id}
          leading={
            <span className="h-2 w-2 rounded-full" style={{ background: getVoltageBandColor(row.voltageBand) }} />
          }
          title={row.name}
          subtitle={`${row.state} · ${SUBSTATION_TYPE_LABELS[row.substationType]} · ${formatVoltage(row)}${
            row.ownerName ? ` · ${row.ownerName}` : ""
          }`}
          trailing={
            <span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)" }}>
              {VOLTAGE_BAND_LABELS[row.voltageBand]}
            </span>
          }
          trailingShape="metric"
          onSelect={() => handleRowClick(row.slug)}
        />
      ))}
    </InfiniteListShell>
  );
}
