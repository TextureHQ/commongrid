"use client";

/**
 * ProgramListPanel — Explorer panel for utility / aggregator programs.
 *
 * Migrated onto `useInfiniteList` + `InfiniteListShell` (same pattern as
 * EV charging, power plants, transmission lines, substations, pricing
 * nodes — see PR #309). The previous implementation fetched up to 200
 * programs in one SWR call and ran client-side Fuse over the bag. That
 * worked while the catalog was small, but a stale loading state could
 * leave the panel rendering skeletons indefinitely, which is what
 * surfaced as the "Programs panel flickering / crash" report on prod.
 *
 * Behavior change worth flagging:
 * - Map utility-highlight filtering (`setFilteredUtilitySlugs`) now
 *   reflects the *visible page* of program rows, not the full filtered
 *   set. With server-side pagination at 50/page this is a deliberate
 *   trade-off: correctness of the loading lifecycle over a complete map
 *   highlight that requires fetching every matching program up front.
 *   The set updates as the user scrolls more pages in.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useUtilityList } from "@/hooks/useUtilityList";
import { entityKindColor } from "@/lib/categorical-colors";
import { AssetTypeLabel, CompensationTypeLabel, CompensationUnitLabel, type Program } from "@/types/programs";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const assetTypeFilterOptions = [
  { id: "all", label: "All Asset Types", value: "all" },
  { id: "BATTERY", label: "Battery Storage", value: "BATTERY" },
  { id: "THERMOSTAT", label: "Smart Thermostat", value: "THERMOSTAT" },
  { id: "EV_CHARGER", label: "EV Charger", value: "EV_CHARGER" },
  { id: "WATER_HEATER", label: "Water Heater", value: "WATER_HEATER" },
  { id: "HVAC", label: "HVAC", value: "HVAC" },
  { id: "SOLAR_PV", label: "Solar PV", value: "SOLAR_PV" },
  { id: "POOL_PUMP", label: "Pool Pump", value: "POOL_PUMP" },
  { id: "GENERATOR", label: "Generator", value: "GENERATOR" },
];

function getPrimaryCompensationSummary(program: Program): string {
  if (!program.compensationTiers || program.compensationTiers.length === 0) return "";
  const tier = program.compensationTiers[0];
  const typeLabel = CompensationTypeLabel[tier.type] ?? tier.type;
  const unitLabel = CompensationUnitLabel[tier.unit] ?? tier.unit;
  return `$${tier.amount} ${typeLabel.toLowerCase()} ${unitLabel}`;
}

function statusLabel(s: string): string {
  if (s === "ACTIVE") return "Active";
  if (s === "PAUSED") return "Paused";
  if (s === "FULL") return "Full";
  return s;
}

function statusColor(s: string): string {
  if (s === "ACTIVE") return "var(--color-feedback-success-text)";
  if (s === "PAUSED") return "var(--color-feedback-warning-text)";
  return "var(--color-text-muted)";
}

function getAdminUtilitySlug(program: Program): string | null {
  const adminOrg = program.organizations.find((o) => o.role === "ADMINISTRATOR");
  return adminOrg?.entityId ?? null;
}

export function ProgramListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail, setFilteredUtilitySlugs } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  // Load utility names for displaying in the list (slug → name lookup)
  const { utilities } = useUtilityList({ limit: 200 });

  const params = useMemo(
    () => ({
      search: state.q,
      assetType: state.type !== "all" ? state.type : undefined,
      sort: "name",
      order: "asc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isLoadingMore, error, sentinelRef, loadMore } = useInfiniteList<Program>({
    endpoint: "/api/v1/programs",
    params,
  });

  // Push the visible page's administrator-utility slugs to the map. When
  // there's no active filter, clear the constraint so the map shows all
  // utility regions. See file header for the page-vs-total trade-off.
  //
  // We compute and dispatch in a single effect, gated by a serialized
  // string of slugs so identical sets don't trigger a re-dispatch. With
  // server-side pagination at 50/page items is a stable reference between
  // pages, but the filter-clear path used to fire on every parent
  // re-render (because state object identity changes on every dispatch
  // throughout the explore tree) — which storm'd the map's utility tile
  // fetches. Gating on the slug-string fixes it.
  const hasActiveFilter = state.q !== "" || state.type !== "all";
  const slugsKey = useMemo(() => {
    if (!hasActiveFilter) return "__none__";
    const unique = [...new Set(items.map(getAdminUtilitySlug).filter((s): s is string => s !== null))].sort();
    return unique.join(",");
  }, [items, hasActiveFilter]);

  useEffect(() => {
    if (slugsKey === "__none__") {
      setFilteredUtilitySlugs(null);
      return;
    }
    setFilteredUtilitySlugs(slugsKey ? slugsKey.split(",") : []);
  }, [slugsKey, setFilteredUtilitySlugs]);

  // Clear on unmount (e.g. tab switch away from Programs).
  useEffect(() => {
    return () => setFilteredUtilitySlugs(null);
  }, [setFilteredUtilitySlugs]);

  const handleRowClick = useCallback(
    (slug: string) => {
      navigateToDetail("program", slug);
    },
    [navigateToDetail]
  );

  return (
    <InfiniteListShell
      entityLabel="programs"
      emptyLabel="programs"
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
      searchPlaceholder="Search programs…"
      filterOptions={assetTypeFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      addAction={{
        label: "+ Add",
        onClick: () => router.push("/programs/new"),
        visible: !!user,
      }}
      hasActiveFilter={state.type !== "all"}
    >
      {items.map((row) => {
        const adminOrg = row.organizations.find((o) => o.role === "ADMINISTRATOR");
        const adminSlug = adminOrg?.entityId ?? null;
        const utilityName = adminSlug ? (utilities.find((u) => u.slug === adminSlug)?.name ?? adminSlug) : "—";
        const compensationSummary = getPrimaryCompensationSummary(row);
        return (
          <PanelEntityRow
            key={row.slug}
            leading={<span className="h-2 w-2 rounded-full" style={{ background: entityKindColor("programs") }} />}
            title={row.name}
            subtitle={`${utilityName} · ${row.assetTypes
              .map((at) => AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at)
              .join(", ")}`}
            trailing={
              <div className="flex flex-col items-end gap-0.5">
                <span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)", color: statusColor(row.status) }}>
                  {statusLabel(row.status)}
                </span>
                {compensationSummary && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-family-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {compensationSummary}
                  </span>
                )}
              </div>
            }
            trailingShape="metric+badge"
            onSelect={() => handleRowClick(row.slug)}
          />
        );
      })}
    </InfiniteListShell>
  );
}
