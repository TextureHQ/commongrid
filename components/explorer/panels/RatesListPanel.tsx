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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExplorer } from "../ExplorerContext";

interface Rate {
  slug: string;
  name: string;
  utilityName: string;
  tariffType: string;
  status: string;
}

interface RateRow {
  slug: string;
  name: string;
  utilityName: string;
  tariffType: string;
  status: string;
}

interface PaginationMeta {
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

const sortOptions = [
  { id: "name:asc", label: "Rate Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Rate Name Z-A", value: "name:desc" },
  { id: "utilityName:asc", label: "Utility A-Z", value: "utilityName:asc" },
  { id: "utilityName:desc", label: "Utility Z-A", value: "utilityName:desc" },
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
    field: "tariffType", // Assuming a 'tariffType' field for rates
    label: "Tariff Type",
    type: "string",
    values: [
      { value: "residential", label: "Residential" },
      { value: "commercial", label: "Commercial" },
      { value: "industrial", label: "Industrial" },
      { value: "community-solar", label: "Community Solar" },
      { value: "net-metering", label: "Net Metering" },
    ],
  },
  {
    field: "state", // Assuming rates are tied to states
    label: "State",
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

function filtersToTariffType(filters: FilterState): string {
  const values = getSelectedValues(filters, "tariffType");
  return values.length === 1 ? values[0] : "all";
}

function filtersToState(filters: FilterState): string[] {
  return getSelectedValues(filters, "state");
}

function buildFilterState(tariffType: string, states: string[]): FilterState {
  let filters = createEmptyFilter();
  if (tariffType !== "all") {
    filters = addFilterCondition(filters, { field: "tariffType", operator: "in", value: [tariffType] });
  }
  if (states.length > 0) {
    filters = addFilterCondition(filters, { field: "state", operator: "in", value: states });
  }
  return filters;
}

function buildApiParams(
  q: string,
  tariffType: string,
  states: string[],
  sortValue: string,
  limit: number,
  cursor?: string | null
): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tariffType !== "all") params.set("tariffType", tariffType);
  if (states.length > 0) params.set("state", states[0]);
  const [sortField, sortOrder] = sortValue.split(":");
  params.set("sort", sortField ?? "name");
  params.set("order", sortOrder ?? "asc");
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return params;
}

const SearchIcon = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const FilterIcon = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 3H2l8 9.46V19l4 2V12.46z" />
  </svg>
);

export function RatesListPanel() {
  const { state, setSearch, setTypeFilter, setJurisdictions, navigateToDetail } = useExplorer();

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortValue, setSortValue] = useState("name:asc");

  const [rates, setRates] = useState<Rate[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, nextCursor: null, hasMore: false, limit: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState(state.q);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(state.q);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [state.q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = buildApiParams(debouncedSearch, state.type, state.jurisdictions, sortValue, 50); // Assuming state.type maps to tariffType and state.jurisdictions to states

    setIsLoading(true);
    fetch(`/api/v1/rates?${params.toString()}`, { signal: controller.signal }) // API endpoint for rates
      .then((res) => res.json())
      .then((data) => {
        setRates(data.data ?? []);
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
  }, [debouncedSearch, state.type, state.jurisdictions, sortValue]);

  const loadMore = useCallback(async () => {
    if (!meta.nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    const params = buildApiParams(debouncedSearch, state.type, state.jurisdictions, sortValue, 50, meta.nextCursor);

    const res = await fetch(`/api/v1/rates?${params.toString()}`);
    const data = await res.json();

    setRates((prev) => [...prev, ...(data.data ?? [])]);
    setMeta({
      total: data.pagination?.total ?? 0,
      nextCursor: data.pagination?.cursor ?? null,
      hasMore: data.pagination?.hasMore ?? false,
      limit: data.pagination?.limit ?? 50,
    });
    setIsLoadingMore(false);
  }, [meta.nextCursor, isLoadingMore, debouncedSearch, state.type, state.jurisdictions, sortValue]);

  const filterState = useMemo(
    () => buildFilterState(state.type, state.jurisdictions),
    [state.type, state.jurisdictions]
  );

  const rows: RateRow[] = useMemo(
    () =>
      rates.map((r) => ({
        slug: r.slug,
        name: r.name,
        utilityName: r.utilityName, // Assuming 'utilityName' for a rate
        tariffType: r.tariffType, // Assuming 'tariffType' for a rate
        status: r.status,
      })),
    [rates]
  );

  const handleApplyFilters = useCallback(
    (newFilters: FilterState) => {
      setTypeFilter(filtersToTariffType(newFilters));
      setJurisdictions(filtersToState(newFilters));
    },
    [setTypeFilter, setJurisdictions]
  );

  const handleClearFilters = useCallback(() => {
    setTypeFilter("all");
    setJurisdictions([]);
  }, [setTypeFilter, setJurisdictions]);

  const activeFilterCount = getFilterFields(filterState).length;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((skeletonKey) => (
            <PanelEntityRow key={skeletonKey} loading leadingShape="dot" title="" onSelect={() => {}} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header with search and controls */}
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{meta.total.toLocaleString()}</strong> rates
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
            {/* Removed the "+ Add" button, assuming adding rates is not directly supported via UI */}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <div className="cg-explore-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search rates…"
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
        {rows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No rates found</div>
            <div>
              {state.q || activeFilterCount > 0
                ? "Try adjusting your search or filters."
                : "No rates match the selected filters."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <PanelEntityRow
              key={row.slug}
              leading={
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-feedback-info-dark)" }} />
              }
              title={row.name}
              subtitle={`${row.utilityName} · ${row.tariffType}`}
              onSelect={() => navigateToDetail("rates", row.slug)}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {meta.hasMore && (
        <div className="cg-explore-pagination">
          <span className="cg-explore-pagination-info">
            Showing <b>{rates.length.toLocaleString()}</b> of <b>{meta.total.toLocaleString()}</b>
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
        title="Filter Rates"
        resultCount={meta.total}
      />
    </div>
  );
}
