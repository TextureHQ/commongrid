"use client";

/**
 * EVChargingListPanel — Explorer panel for EV charging stations.
 *
 * Server-side search + cursor pagination via `useInfiniteList`. The
 * panel renders 50 rows per page and auto-loads more when the user
 * scrolls near the bottom of the list. With 85k+ stations in the
 * dataset this replaces the old "fetch limit=500 and Fuse client-side"
 * pattern that silently failed on the API's 200-row cap.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { EVStation } from "@/types/ev-charging";
import { EV_NETWORKS, getNetworkColor, getNetworkShortName } from "@/types/ev-charging";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const networkFilterOptions = [
  { id: "all", label: "All Networks", value: "all" },
  ...EV_NETWORKS.map((n) => ({ id: n.id, label: n.label, value: n.id })),
];

export function EVChargingListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const params = useMemo(
    () => ({
      search: state.q,
      network: state.type !== "all" ? state.type : undefined,
      sort: "stationName",
      order: "asc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isLoadingMore, error, sentinelRef, loadMore } = useInfiniteList<EVStation>({
    endpoint: "/api/v1/ev-stations",
    params,
  });

  const handleRowClick = useCallback(
    (slug: string) => {
      router.push(`/ev-charging/${slug}`);
    },
    [router]
  );

  return (
    <InfiniteListShell
      entityLabel="stations"
      emptyLabel="EV charging stations"
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
      searchPlaceholder="Search stations, cities, networks…"
      filterOptions={networkFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "+ Add",
        onClick: () => router.push("/ev-charging/new"),
        visible: !!user,
      }}
      hasActiveFilter={state.type !== "all"}
    >
      {items.map((row) => (
        <PanelEntityRow
          key={row.id}
          leading={<span className="h-2 w-2 rounded-full" style={{ background: getNetworkColor(row.evNetwork) }} />}
          title={row.stationName}
          subtitle={`${row.city}, ${row.state} · ${getNetworkShortName(row.evNetwork)}`}
          trailing={
            <div className="flex flex-col items-end gap-px">
              {row.evDcFastNum > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-family-mono)",
                    color: "var(--color-text-heading)",
                  }}
                >
                  {row.evDcFastNum} DC Fast
                </span>
              )}
              {row.evLevel2EvseNum > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-family-mono)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {row.evLevel2EvseNum} L2
                </span>
              )}
            </div>
          }
          trailingShape="metric+badge"
          onSelect={() => handleRowClick(row.slug)}
        />
      ))}
    </InfiniteListShell>
  );
}
