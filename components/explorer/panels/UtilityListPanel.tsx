"use client";

import {
  addFilterCondition,
  createEmptyFilter,
  type FacetConfig,
  FilterDialog,
  type FilterState,
  getFilterFields,
} from "@texturehq/edges";
import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SEARCH_DEBOUNCE_MS } from "@/lib/config/constants";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { utilityColor } from "@/lib/categorical-colors";
import { getSegmentLabel } from "@/lib/formatting";
import { type Utility, UtilitySegment, UtilitySegmentLabel } from "@/types/entities";
import { useExplorer } from "../ExplorerContext";

interface UtilityRow {
  slug: string;
  name: string;
  logo: string | null;
  segment: string;
  status: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

interface PaginationMeta {
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
];

const ALL_STATE_CODES = [
  "AK",
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
];

const FACET_CONFIGS: FacetConfig[] = [
  {
    field: "segment",
    label: "Segment",
    type: "string",
    values: Object.values(UtilitySegment).map((seg) => ({
      value: seg,
      label: UtilitySegmentLabel[seg],
    })),
  },
  {
    field: "jurisdictions",
    label: "Jurisdictions",
    type: "string",
    values: ALL_STATE_CODES.map((code) => ({ value: code, label: code })),
    searchThreshold: 5,
  },
];

function getSelectedValues(filters: FilterState, field: string): string[] {
  if (!filters) return [];
  const values: string[] = [];
  function traverse(f: FilterState) {
    if (!f) return;
    for (const condition of f.conditions) {
      if ("conditions" in condition) {
        traverse(condition);
      } else if (condition.field === field && condition.operator === "in") {
        if (Array.isArray(condition.value)) {
          values.push(...condition.value.map(String));
        }
      }
    }
  }
  traverse(filters);
  return values;
}

function filtersToJurisdictions(filters: FilterState): string[] {
  return getSelectedValues(filters, "jurisdictions");
}

function filtersToSegment(filters: FilterState): string {
  const values = getSelectedValues(filters, "segment");
  return values.length === 1 ? values[0] : "all";
}

function buildFilterState(segment: string, jurisdictions: string[]): FilterState {
  let filters = createEmptyFilter();
  if (segment !== "all") {
    filters = addFilterCondition(filters, { field: "segment", operator: "in", value: [segment] });
  }
  if (jurisdictions.length > 0) {
    filters = addFilterCondition(filters, { field: "jurisdictions", operator: "in", value: jurisdictions });
  }
  return filters;
}

function buildApiParams(
  q: string,
  segment: string,
  jurisdictions: string[],
  sortValue: string,
  limit: number,
  cursor?: string | null
): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (segment !== "all") params.set("segment", segment);
  if (jurisdictions.length > 0) params.set("state", jurisdictions[0]);
  const [sortField, sortOrder] = sortValue.split(":");
  params.set("sort", sortField ?? "name");
  params.set("order", sortOrder ?? "asc");
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return params;
}

const SearchIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    role="img"
    aria-label="Search"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const FilterIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    role="img"
    aria-label="Filter"
  >
    <path d="M22 3H2l8 9.46V19l4 2V12.46z" />
  </svg>
);

export function UtilityListPanel() {
  const { state, setSearch, setFilters, navigateToDetail } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortValue, setSortValue] = useState("name:asc");

  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, nextCursor: null, hasMore: false, limit: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debouncedSearch = useDebouncedValue(state.q, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const controller = new AbortController();
    const params = buildApiParams(debouncedSearch, state.segment, state.jurisdictions, sortValue, 50);

    setIsLoading(true);
    fetch(`/api/v1/utilities?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setUtilities(data.data ?? []);
        setMeta({
          total: data.pagination?.total ?? 0,
          nextCursor: data.pagination?.cursor ?? null,
          hasMore: data.pagination?.hasMore ?? false,
          limit: data.pagination?.limit ?? 50,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, state.segment, state.jurisdictions, sortValue]);

  const loadMore = useCallback(async () => {
    if (!meta.nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    const params = buildApiParams(debouncedSearch, state.segment, state.jurisdictions, sortValue, 50, meta.nextCursor);

    const res = await fetch(`/api/v1/utilities?${params.toString()}`);
    const data = await res.json();

    setUtilities((prev) => [...prev, ...(data.data ?? [])]);
    setMeta({
      total: data.pagination?.total ?? 0,
      nextCursor: data.pagination?.cursor ?? null,
      hasMore: data.pagination?.hasMore ?? false,
      limit: data.pagination?.limit ?? 50,
    });
    setIsLoadingMore(false);
  }, [meta.nextCursor, isLoadingMore, debouncedSearch, state.segment, state.jurisdictions, sortValue]);

  const filterState = useMemo(
    () => buildFilterState(state.segment, state.jurisdictions),
    [state.segment, state.jurisdictions]
  );

  const rows: UtilityRow[] = useMemo(
    () =>
      utilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        logo: u.logo,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [utilities]
  );

  const handleApplyFilters = useCallback(
    (newFilters: FilterState) => {
      setFilters({
        segment: filtersToSegment(newFilters),
        jurisdictions: filtersToJurisdictions(newFilters),
      });
    },
    [setFilters]
  );

  const handleClearFilters = useCallback(() => {
    setFilters({
      segment: "all",
      jurisdictions: [],
    });
  }, [setFilters]);

  const activeFilterCount = getFilterFields(filterState).length;
  const isInitialLoading = isLoading && rows.length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header with search and controls */}
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{meta.total.toLocaleString()}</strong> utilities
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="cg-explore-icon-btn"
              data-active={activeFilterCount > 0}
              onClick={() => setFilterDialogOpen(true)}
            >
              <FilterIcon /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <select className="cg-explore-select" value={sortValue} onChange={(e) => setSortValue(e.target.value)}>
              {sortOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/grid-operators/new")}>
                + Add
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <div className="cg-explore-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search utilities…"
              value={state.q}
              onChange={(e) => setSearch(e.target.value)}
            />
            {state.q && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Entity list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isInitialLoading ? (
          Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((skeletonKey) => (
            <PanelEntityRow key={skeletonKey} loading leadingShape="dot" title="" onSelect={() => {}} />
          ))
        ) : rows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No utilities found</div>
            <div>
              {state.q || activeFilterCount > 0
                ? "Try adjusting your search or filters."
                : "No utilities match the selected filters."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <PanelEntityRow
              key={row.slug}
              leading={<span className="h-2 w-2 rounded-full" style={{ background: utilityColor(row.segment) }} />}
              title={row.name}
              subtitle={`${row.jurisdiction ?? "—"} · ${getSegmentLabel(row.segment)}`}
              onSelect={() => navigateToDetail("utility", row.slug)}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {meta.hasMore && (
        <div className="cg-explore-pagination">
          <span className="cg-explore-pagination-info">
            Showing <b>{utilities.length.toLocaleString()}</b> of <b>{meta.total.toLocaleString()}</b>
          </span>
          <button
            type="button"
            className="cg-explore-page-btn"
            style={{ width: "auto", padding: "0 12px" }}
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "…" : "Load more"}
          </button>
        </div>
      )}

      <FilterDialog
        isOpen={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        facetConfigs={FACET_CONFIGS}
        currentFilters={filterState}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        title="Filter Utilities"
        resultCount={meta.total}
      />
    </div>
  );
}
