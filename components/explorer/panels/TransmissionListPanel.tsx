"use client";

/**
 * TransmissionListPanel — Explorer panel for transmission lines.
 *
 * Server-side search + cursor pagination via `useInfiniteList`. Replaces
 * the old `useTransmissionLineList({ limit: 500 })` + client-side Fuse
 * pattern that 400'd on the API's 200-row cap.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { voltageColor } from "@/lib/categorical-colors";
import {
  type TransmissionLine,
  VOLTAGE_CLASSES,
  type VoltageClass,
  VoltageClassLabel,
} from "@/types/transmission-lines";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const voltageClassFilterOptions = [
  { id: "all", label: "All Voltage Classes", value: "all" },
  ...VOLTAGE_CLASSES.map((vc) => ({
    id: vc,
    label: VoltageClassLabel[vc],
    value: vc,
  })),
];

function getVoltageShortLabel(vc: VoltageClass): string {
  switch (vc) {
    case "extra-high":
      return "345kV+";
    case "high":
      return "230–344kV";
    case "medium":
      return "115–229kV";
    case "sub-trans":
      return "69–114kV";
    default:
      return "Unknown";
  }
}

export function TransmissionListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const params = useMemo(
    () => ({
      search: state.q,
      voltageClass: state.type !== "all" ? state.type : undefined,
      sort: "voltageClass",
      order: "desc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isFetching, isLoadingMore, error, sentinelRef, loadMore } =
    useInfiniteList<TransmissionLine>({
      endpoint: "/api/v1/transmission-lines",
      params,
    });

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/transmission-lines/${id}`);
    },
    [router]
  );

  return (
    <InfiniteListShell
      entityLabel="lines"
      emptyLabel="transmission lines"
      total={total}
      isLoading={isLoading}
      isFetching={isFetching}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      sentinelRef={sentinelRef}
      loadMore={loadMore}
      visibleCount={items.length}
      searchValue={state.q}
      onSearchChange={setSearch}
      searchPlaceholder="Search by owner, ID, substation…"
      filterOptions={voltageClassFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "+ Add",
        onClick: () => router.push("/transmission-lines/new"),
        visible: !!user,
      }}
      hasActiveFilter={state.type !== "all"}
    >
      {items.map((row) => (
        <PanelEntityRow
          key={row.objectId}
          leading={<span className="h-2 w-2 rounded-full" style={{ background: voltageColor(row.voltageClass) }} />}
          title={row.owner || "Unknown owner"}
          subtitle={`${row.sub1} → ${row.sub2} · ${getVoltageShortLabel(row.voltageClass)}${
            row.voltage != null && row.voltage > 0 ? ` (${row.voltage} kV)` : ""
          }`}
          trailing={
            <span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)" }}>
              {row.lengthMiles > 0 ? `${row.lengthMiles.toFixed(1)} mi` : "—"}
            </span>
          }
          trailingShape="metric"
          onSelect={() => handleRowClick(row.id)}
        />
      ))}
    </InfiniteListShell>
  );
}
