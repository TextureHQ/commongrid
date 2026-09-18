"use client";

/**
 * InfiniteListShell — common chrome for every overlay list panel: header
 * (count, filter select, optional Add button), search input, virtualized-ish
 * scrollable region, sentinel for infinite scroll, footer load-more button
 * fallback, error and empty states. Panels supply only what's unique to them
 * (filter options, row renderer, entity label, add href).
 */

import { Select, TextField } from "@texturehq/edges";
import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import type { ReactNode } from "react";

interface FilterOption {
  id: string;
  label: string;
  value: string;
}

export interface InfiniteListShellProps {
  /** Plural noun shown in the count strip, e.g. "stations", "lines". */
  entityLabel: string;
  /** Total result count from the server. */
  total: number;
  /** Whether the first page is still loading (renders skeletons). */
  isLoading: boolean;
  /** Whether a subsequent page is loading (renders a footer indicator). */
  isLoadingMore: boolean;
  /** Error message to surface in place of the list. `null` to hide. */
  error: string | null;
  /** Whether more pages are available. Drives the sentinel/load-more footer. */
  hasMore: boolean;
  /** Sentinel ref from `useInfiniteList`. Attached to the bottom marker. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Manual load-more trigger (for fallback button). */
  loadMore: () => void;

  /** Number of rows visible in the list — drives the "no results" copy. */
  visibleCount: number;
  /** Children renders the actual rows. */
  children: ReactNode;

  /** Search input value (parent owns state.q). */
  searchValue: string;
  /** Search input setter. */
  onSearchChange: (next: string) => void;
  /** Search input placeholder. */
  searchPlaceholder: string;

  /** Filter select options. Pass `null` to hide the filter select. */
  filterOptions?: FilterOption[] | null;
  /** Filter select value. Required when `filterOptions` is set. */
  filterValue?: string;
  /** Filter select change handler. */
  onFilterChange?: (next: string) => void;

  /** Optional add-action button (rendered when user is signed in). */
  addAction?: {
    label: string;
    onClick: () => void;
    visible: boolean;
  };

  /** Whether any user-applied filter is active (drives empty-state copy). */
  hasActiveFilter: boolean;

  /** Singular noun for empty-state copy, e.g. "EV charging stations". */
  emptyLabel?: string;
}

export function InfiniteListShell({
  entityLabel,
  total,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  sentinelRef,
  loadMore,
  visibleCount,
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterOptions,
  filterValue,
  onFilterChange,
  addAction,
  hasActiveFilter,
  emptyLabel,
}: InfiniteListShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{total.toLocaleString()}</strong> {entityLabel}
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {filterOptions && onFilterChange && (
              <Select
                size="sm"
                selectedKey={filterValue ?? ""}
                onSelectionChange={(key) => onFilterChange(String(key))}
                items={filterOptions.map((opt) => ({ id: String(opt.value), label: opt.label, value: opt.value }))}
                renderItem={(item) => item.label}
              />
            )}
            {addAction?.visible && (
              <button type="button" className="cg-explore-icon-btn" onClick={addAction.onClick}>
                {addAction.label}
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <TextField
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={onSearchChange}
            showSearchIcon
            isClearable
            onClear={() => onSearchChange("")}
            reserveErrorSpace={false}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((skeletonKey) => (
            <PanelEntityRow
              key={skeletonKey}
              loading
              leadingShape="dot"
              trailingShape="metric"
              title=""
              onSelect={() => {}}
            />
          ))
        ) : error ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">Couldn't load {entityLabel}</div>
            <div>{error}</div>
          </div>
        ) : visibleCount === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No {emptyLabel ?? entityLabel} found</div>
            <div>
              {searchValue || hasActiveFilter
                ? "Try adjusting your search or filters."
                : `No ${emptyLabel ?? entityLabel} in the dataset.`}
            </div>
          </div>
        ) : (
          <>
            {children}
            {hasMore && (
              <>
                {/* Sentinel for IntersectionObserver — invisible div. */}
                <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
                <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                  <button
                    type="button"
                    className="cg-explore-icon-btn"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    style={{ opacity: isLoadingMore ? 0.6 : 1 }}
                  >
                    {isLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
