"use client";

/**
 * PricingNodeListPanel — Explorer panel for wholesale pricing nodes.
 *
 * Server-side search + cursor pagination via `useInfiniteList`. Replaces
 * the old `usePricingNodeList({ limit: 200 })` + client-side Fuse pattern
 * (which capped the visible nodes at 200 of many thousand).
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { PricingNode } from "@/types/pricing-nodes";
import { getIsoColor, getNodeTypeLabel, ISO_LABELS, ISOS } from "@/types/pricing-nodes";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const isoFilterOptions = [
  { id: "all", label: "All ISOs/RTOs", value: "all" },
  ...ISOS.map((iso) => ({ id: iso, label: ISO_LABELS[iso], value: iso })),
];

export function PricingNodeListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const params = useMemo(
    () => ({
      search: state.q,
      iso: state.type !== "all" ? state.type : undefined,
      sort: "nodeType",
      order: "asc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isLoadingMore, error, sentinelRef, loadMore } =
    useInfiniteList<PricingNode>({
      endpoint: "/api/v1/pricing-nodes",
      params,
    });

  const handleRowClick = useCallback(
    (slug: string) => {
      navigateToDetail("pricing-node", slug);
    },
    [navigateToDetail]
  );

  return (
    <InfiniteListShell
      entityLabel="pricing nodes"
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
      searchPlaceholder="Search nodes, zones, ISOs…"
      filterOptions={isoFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "+ Add",
        onClick: () => router.push("/pricing-nodes/new"),
        visible: !!user,
      }}
      hasActiveFilter={state.type !== "all"}
    >
      {items.map((row) => (
        <PanelEntityRow
          key={row.slug}
          leading={<span className="h-2 w-2 rounded-full" style={{ background: getIsoColor(row.iso) }} />}
          title={row.name}
          subtitle={`${ISO_LABELS[row.iso]} · ${getNodeTypeLabel(row.nodeType)}${row.zone ? ` · ${row.zone}` : ""}${
            row.state ? ` · ${row.state}` : ""
          }`}
          onSelect={() => handleRowClick(row.slug)}
        />
      ))}
    </InfiniteListShell>
  );
}
