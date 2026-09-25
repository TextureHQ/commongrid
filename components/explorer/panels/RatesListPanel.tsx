"use client";

/**
 * RatesListPanel — Explorer panel for utility rate structures.
 *
 * Uses the same `useInfiniteList` + `InfiniteListShell` pattern as the
 * other entity panels (Programs, EV charging, power plants, etc.).
 *
 * There is not yet a detail view for rate structures, so rows are not
 * navigable. If a `sourceUrl` is present on a row, the entire row is
 * wrapped in a link that opens the source in a new tab.
 */

import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useMemo } from "react";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { entityKindColor } from "@/lib/categorical-colors";
import type { RateStructure } from "@/types/rate-structures";
import { useExplorer } from "../ExplorerContext";
import { InfiniteListShell } from "./InfiniteListShell";

const sectorFilterOptions = [
  { id: "all", label: "All Sectors", value: "all" },
  { id: "Residential", label: "Residential", value: "Residential" },
  { id: "Commercial", label: "Commercial", value: "Commercial" },
];

function formatFixedCharge(rate: RateStructure): string {
  if (!rate.fixedCharge) return "";
  const units = rate.fixedChargeUnits ? ` ${rate.fixedChargeUnits}` : "";
  return `${rate.fixedCharge}${units}`;
}

function CapabilityBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--font-family-mono)",
        textTransform: "uppercase",
        padding: "1px 5px",
        borderRadius: 4,
        background: "var(--color-background-subtle)",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {label}
    </span>
  );
}

export function RatesListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();

  const params = useMemo(
    () => ({
      search: state.q,
      sector: state.type !== "all" ? state.type : undefined,
      sort: "name",
      order: "asc" as const,
    }),
    [state.q, state.type]
  );

  const { items, total, hasMore, isLoading, isLoadingMore, error, sentinelRef, loadMore } =
    useInfiniteList<RateStructure>({
      endpoint: "/api/v1/rates",
      params,
    });

  return (
    <InfiniteListShell
      entityLabel="rates"
      emptyLabel="rates"
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
      searchPlaceholder="Search rates…"
      filterOptions={sectorFilterOptions}
      filterValue={state.type}
      onFilterChange={setTypeFilter}
      hasActiveFilter={state.type !== "all" || state.q !== ""}
    >
      {items.map((row) => {
        const fixedCharge = formatFixedCharge(row);
        const rowContent = (
          <PanelEntityRow
            key={row.slug}
            leading={<span className="h-2 w-2 rounded-full" style={{ background: entityKindColor("rates") }} />}
            title={row.name}
            subtitle={[row.utilityName, row.sector, row.serviceType].filter(Boolean).join(" · ")}
            onSelect={() => {}}
            trailing={
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex flex-wrap justify-end gap-1">
                  {row.hasTou && <CapabilityBadge label="TOU" />}
                  {row.hasDemandCharge && <CapabilityBadge label="Demand" />}
                  {row.hasNetMetering && <CapabilityBadge label="Net Metering" />}
                  {row.isEvRate && <CapabilityBadge label="EV" />}
                </div>
                {fixedCharge && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-family-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {fixedCharge}
                  </span>
                )}
              </div>
            }
            trailingShape="metric+badge"
          />
        );

        if (row.sourceUrl) {
          return (
            <a
              key={row.slug}
              href={row.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block no-underline"
            >
              {rowContent}
            </a>
          );
        }

        return rowContent;
      })}
    </InfiniteListShell>
  );
}
