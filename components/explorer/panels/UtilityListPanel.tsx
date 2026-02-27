"use client";

import {
  Avatar,
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  FilterDialog,
  type FacetConfig,
  type FilterState,
  addFilterCondition,
  createEmptyFilter,
  getFilterFields,
  removeFilterCondition,
  useTableExport,
} from "@texturehq/edges";
import { useCallback, useMemo, useState } from "react";
import { useExplorer } from "../ExplorerContext";
import { getAllUtilities, searchEntities, sortByName } from "@/lib/data";
import {
  getSegmentBadgeVariant,
  getSegmentLabel,
} from "@/lib/formatting";
import { type Utility, UtilitySegment, UtilitySegmentLabel } from "@/types/entities";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  logo: string | null;
  segment: string;
  status: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
];

// All US state/territory codes present in the data
const ALL_STATE_CODES = [
  "AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI",
  "IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN",
  "MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH",
  "OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
  "WI","WV","WY",
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

/** Returns individual state codes from a comma-separated jurisdiction string */
function parseJurisdictionStates(jurisdiction: string | null): string[] {
  if (!jurisdiction) return [];
  return jurisdiction.split(",").map((s) => s.trim()).filter(Boolean);
}

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

export function UtilityListPanel() {
  const { state, setSearch, setSegment, setJurisdictions, navigateToDetail } = useExplorer();

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  // Keep FilterDialog state in sync with ExplorerContext
  const filterState = useMemo(
    () => buildFilterState(state.segment, state.jurisdictions),
    [state.segment, state.jurisdictions]
  );

  const allUtilities = useMemo(() => getAllUtilities(), []);

  const filtered = useMemo(() => {
    let result: Utility[] = allUtilities;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.segment !== "all") {
      result = result.filter((u) => u.segment === state.segment);
    }
    if (state.jurisdictions.length > 0) {
      result = result.filter((u) => {
        const states = parseJurisdictionStates(u.jurisdiction);
        return state.jurisdictions.some((j) => states.includes(j));
      });
    }
    result = sortByName(result, "asc");
    return result;
  }, [allUtilities, state.q, state.segment, state.jurisdictions]);

  const rows: UtilityRow[] = useMemo(
    () =>
      filtered.map((u) => ({
        slug: u.slug,
        name: u.name,
        logo: u.logo,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [filtered]
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

  const exportColumns: Column<UtilityRow>[] = useMemo(
    () => [
      { id: "name", label: "Name", accessor: "name" },
      { id: "segment", label: "Segment", accessor: "segment" },
      { id: "customerCount", label: "Customer Count", accessor: "customerCount" },
      { id: "jurisdiction", label: "Jurisdiction", accessor: "jurisdiction" },
      { id: "status", label: "Status", accessor: "status" },
      { id: "slug", label: "Slug", accessor: "slug" },
    ],
    []
  );

  const { exportCSV, canExport } = useTableExport({
    columns: exportColumns,
    data: rows,
    metadata: { filename: "opengrid-utilities" },
  });

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: filtered.length, label: "utilities" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search utilities...",
          }}
          sort={{
            value: "name:asc",
            options: sortOptions,
            onChange: () => {},
          }}
          filters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearAllFilters={handleClearFilters}
          onManageFilters={() => setFilterDialogOpen(true)}
          customControls={
            <button
              type="button"
              onClick={exportCSV}
              disabled={!canExport}
              title="Export CSV"
              className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-text-body hover:bg-background-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Export CSV"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
              </svg>
            </button>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No utilities found"
            description={state.q || activeFilterCount > 0 ? "Try adjusting your search or filters." : "No utilities match the selected filters."}
            fullHeight={true}
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            mobileBreakpoint="md"
            isLoading={false}
            height="100%"
            stickyHeader={true}
            onRowClick={handleRowClick}
          />
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
        resultCount={filtered.length}
      />
    </div>
  );
}
