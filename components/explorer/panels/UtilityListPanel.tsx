"use client";

import {
  Avatar,
  addFilterCondition,
  Badge,
  type Column,
  createEmptyFilter,
  DataControls,
  DataTable,
  EmptyState,
  type FacetConfig,
  FilterDialog,
  type FilterState,
  getFilterFields,
  Loader,
} from "@texturehq/edges";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { type Utility, UtilitySegment, UtilitySegmentLabel } from "@/types/entities";
import { useExplorer } from "../ExplorerContext";

interface UtilityRow extends Record<string, unknown> {
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

// All US state/territory codes present in the data
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

/** Extract selected string values for a field from FilterState */
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

/** Converts FilterState to the `jurisdictions: string[]` the context expects */
function filtersToJurisdictions(filters: FilterState): string[] {
  return getSelectedValues(filters, "jurisdictions");
}

/** Converts FilterState to the `segment: string` the context expects */
function filtersToSegment(filters: FilterState): string {
  const values = getSelectedValues(filters, "segment");
  return values.length === 1 ? values[0] : "all";
}

/** Build a FilterState from segment + jurisdiction arrays */
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

/** Build URLSearchParams for the /api/v1/utilities endpoint */
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
  // API only supports a single state param; pass first selected jurisdiction
  if (jurisdictions.length > 0) params.set("state", jurisdictions[0]);
  const [sortField, sortOrder] = sortValue.split(":");
  params.set("sort", sortField ?? "name");
  params.set("order", sortOrder ?? "asc");
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function UtilityListPanel() {
  const { state, setSearch, setSegment, setJurisdictions, navigateToDetail } = useExplorer();

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortValue, setSortValue] = useState("name:asc");

  // API-backed state
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, nextCursor: null, hasMore: false, limit: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Debounced search
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

  // Fetch utilities when filters/sort change
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

  // Keep FilterDialog state in sync with ExplorerContext
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

  const handleRowClick = useCallback(
    (row: UtilityRow) => {
      navigateToDetail("utility", row.slug);
    },
    [navigateToDetail]
  );

  const handleApplyFilters = useCallback(
    (newFilters: FilterState) => {
      setSegment(filtersToSegment(newFilters));
      setJurisdictions(filtersToJurisdictions(newFilters));
    },
    [setSegment, setJurisdictions]
  );

  const handleClearFilters = useCallback(() => {
    setSegment("all");
    setJurisdictions([]);
  }, [setSegment, setJurisdictions]);

  // Active filter chips for DataControls
  const activeFilters = useMemo(() => {
    const chips: Array<{ id: string; label: string; value: string }> = [];
    if (state.segment !== "all") {
      chips.push({
        id: "segment",
        label: `Segment: ${UtilitySegmentLabel[state.segment as UtilitySegment] ?? state.segment}`,
        value: state.segment,
      });
    }
    if (state.jurisdictions.length > 0) {
      chips.push({
        id: "jurisdictions",
        label:
          state.jurisdictions.length === 1
            ? `State: ${state.jurisdictions[0]}`
            : `${state.jurisdictions.length} States`,
        value: state.jurisdictions.join(","),
      });
    }
    return chips;
  }, [state.segment, state.jurisdictions]);

  const handleRemoveFilter = useCallback(
    (id: string) => {
      if (id === "segment") setSegment("all");
      if (id === "jurisdictions") setJurisdictions([]);
    },
    [setSegment, setJurisdictions]
  );

  const activeFilterCount = getFilterFields(filterState).length;

  const columns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <span className="flex items-center gap-2 font-medium text-text-body">
            <Avatar
              {...(row.logo ? { src: row.logo } : {})}
              fullName={row.name}
              size="sm"
              shape="square"
              variant="organization"
            />
            {row.name}
          </span>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "segment",
        label: "Segment",
        accessor: "segment",
        render: (_value: unknown, row: UtilityRow) => (
          <Badge size="sm" shape="pill" variant={getSegmentBadgeVariant(row.segment)}>
            {getSegmentLabel(row.segment)}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: meta.total, label: "utilities" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search utilities...",
          }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          filters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAllFilters={handleClearFilters}
          onManageFilters={() => setFilterDialogOpen(true)}
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No utilities found"
            description={
              state.q || activeFilterCount > 0
                ? "Try adjusting your search or filters."
                : "No utilities match the selected filters."
            }
            fullHeight={true}
          />
        ) : (
          <>
            <DataTable
              data={rows}
              columns={columns}
              mobileBreakpoint="md"
              isLoading={false}
              height="100%"
              stickyHeader={true}
              onRowClick={handleRowClick}
            />
            {meta.hasMore && (
              <div className="flex justify-center py-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary-hover disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoadingMore && <Loader size={16} />}
                  {isLoadingMore
                    ? "Loading..."
                    : `Load More (${(meta.total - utilities.length).toLocaleString()} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

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
