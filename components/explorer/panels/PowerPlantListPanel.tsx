"use client";

/**
 * PowerPlantListPanel — Explorer panel for power plants.
 *
 * Server-side search + cursor pagination via `useInfiniteList`. Replaces
 * the old `usePowerPlantList({ limit: 500 })` + client-side Fuse pattern
 * that 400'd on the API's 200-row cap.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { formatCapacity, getFuelCategoryColor, getFuelCategoryLabel } from "@/lib/formatting";
import { FUEL_CATEGORIES, FuelCategoryLabel, type PowerPlant } from "@/types/entities";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const fuelFilterOptions = [
  { id: "all", label: "All Fuel Types", value: "all" },
  ...FUEL_CATEGORIES.map((cat) => ({
    id: cat,
    label: FuelCategoryLabel[cat],
    value: cat,
  })),
];

export function PowerPlantListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const params = useMemo(
    () => ({
      search: state.q,
      fuelCategory: state.type !== "all" ? state.type : undefined,
      sort: "totalCapacityMw",
      order: "desc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isLoadingMore, error, sentinelRef, loadMore } = useInfiniteList<PowerPlant>(
    {
      endpoint: "/api/v1/power-plants",
      params,
    }
  );

  const handleRowClick = useCallback(
    (slug: string) => {
      navigateToDetail("power-plant", slug);
    },
    [navigateToDetail]
  );

  return (
    <InfiniteListShell
      entityLabel="power plants"
      total={total}
      isLoading={isLoading}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      sentinelRef={sentinelRef}
      loadMore={loadMore}
      visibleCount={items.length}
      searchValue={state.q}
      onSearchChange={setSearch}
      searchPlaceholder="Search plants, utilities, states…"
      filterOptions={fuelFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "+ Add",
        onClick: () => router.push("/power-plants/new"),
        visible: !!user,
      }}
      hasActiveFilter={state.type !== "all"}
    >
      {items.map((row) => (
        <PanelEntityRow
          key={row.slug}
          leading={
            <span className="h-2 w-2 rounded-full" style={{ background: getFuelCategoryColor(row.fuelCategory) }} />
          }
          title={row.name}
          subtitle={`${row.state} · ${getFuelCategoryLabel(row.fuelCategory)} · ${
            row.status === "operable" ? formatCapacity(row.totalCapacityMw) : formatCapacity(row.proposedCapacityMw)
          }`}
          trailing={<span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)" }}>{row.utilityName}</span>}
          trailingShape="metric"
          onSelect={() => handleRowClick(row.slug)}
        />
      ))}
    </InfiniteListShell>
  );
}
