"use client";

import {
  Avatar,
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  FilterDialog,
  PageLayout,
  TextCell,
  type FacetConfig,
  type FilterState,
  addFilterCondition,
  createEmptyFilter,
  getFilterFields,
  removeFilterCondition,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { getAllUtilities, searchEntities, sortByName } from "@/lib/data";
import {
  formatCustomerCount,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
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
  isoId: string | null;
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

export default function UtilitiesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  const filterState = useMemo(
    () => buildFilterState(segmentFilter, jurisdictions),
    [segmentFilter, jurisdictions]
  );

  const allUtilities = useMemo(() => getAllUtilities(), []);

  const filtered = useMemo(() => {
    let result: Utility[] = allUtilities;
    if (searchQuery) {
      result = searchEntities(result, searchQuery);
    }
    if (segmentFilter !== "all") {
      result = result.filter((u) => u.segment === segmentFilter);
    }
    if (jurisdictions.length > 0) {
      result = result.filter((u) => {
        const states = parseJurisdictionStates(u.jurisdiction);
        return jurisdictions.some((j) => states.includes(j));
      });
    }
    const [field, direction] = sortValue.split(":");
    if (field === "name") {
      result = sortByName(result, direction as "asc" | "desc");
    }
    return result;
  }, [allUtilities, searchQuery, segmentFilter, jurisdictions, sortValue]);

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
        isoId: u.isoId,
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: UtilityRow) => {
      router.push(`/utilities/${row.slug}`);
    },
    [router]
  );

  const handleApplyFilters = useCallback((newFilters: FilterState) => {
    const segmentValues = getSelectedValues(newFilters, "segment");
    setSegmentFilter(segmentValues.length === 1 ? segmentValues[0] : "all");
    setJurisdictions(getSelectedValues(newFilters, "jurisdictions"));
  }, []);

  const handleClearFilters = useCallback(() => {
    setSegmentFilter("all");
    setJurisdictions([]);
  }, []);

  // Active filter chips
  const activeFilters = useMemo(() => {
    const chips: Array<{ id: string; label: string; value: string }> = [];
    if (segmentFilter !== "all") {
      chips.push({
        id: "segment",
        label: `Segment: ${UtilitySegmentLabel[segmentFilter as UtilitySegment] ?? segmentFilter}`,
        value: segmentFilter,
      });
    }
    if (jurisdictions.length > 0) {
      chips.push({
        id: "jurisdictions",
        label: jurisdictions.length === 1 ? `State: ${jurisdictions[0]}` : `${jurisdictions.length} States`,
        value: jurisdictions.join(","),
      });
    }
    return chips;
  }, [segmentFilter, jurisdictions]);

  const handleRemoveFilter = useCallback((id: string) => {
    if (id === "segment") setSegmentFilter("all");
    if (id === "jurisdictions") setJurisdictions([]);
  }, []);

  const activeFilterCount = getFilterFields(filterState).length;

  const columns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <Link
            href={`/utilities/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <Avatar
              {...(row.logo ? { src: row.logo } : {})}
              fullName={row.name}
              size="sm"
              shape="square"
              variant="organization"
            />
            {row.name}
          </Link>
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
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: UtilityRow) => (
          <Badge size="sm" shape="pill" variant={getStatusBadgeVariant(row.status)}>
            {getStatusLabel(row.status)}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "customerCount",
        label: "Customers",
        accessor: "customerCount",
        render: (_value: unknown, row: UtilityRow) => (
          <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>
        ),
        mobile: false,
      },
      {
        id: "jurisdiction",
        label: "Jurisdiction",
        accessor: "jurisdiction",
        cell: TextCell,
        mobile: { priority: 3, format: "secondary" },
      },
    ],
    []
  );

  return (
    <PageLayout className="flex flex-col h-full overflow-hidden" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
      <div className="flex-none">
        <PageLayout.Header title="Utilities" sticky={true} />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "utilities" }}
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            onClear: () => setSearchQuery(""),
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
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No utilities found"
            description={searchQuery || activeFilterCount > 0 ? "Try adjusting your filters." : "No utilities in the dataset."}
            fullHeight={true}
          />
        ) : (
          <DataTable
            className="border-r border-l"
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
    </PageLayout>
  );
}
