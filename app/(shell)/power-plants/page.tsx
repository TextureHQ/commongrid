"use client";

import {
  Badge,
  Button,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Icon,
  Loader,
  PageLayout,
  TextCell,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SEARCH_DEBOUNCE_MS } from "@/lib/config/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePowerPlantList } from "@/hooks/usePowerPlantList";
import {
  formatCapacity,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getPlantStatusBadgeVariant,
} from "@/lib/formatting";
import { FUEL_CATEGORIES, FuelCategoryLabel } from "@/types/entities";

interface PowerPlantRow extends Record<string, unknown> {
  slug: string;
  name: string;
  fuelCategory: string;
  totalCapacityMw: number;
  state: string;
  utilityName: string;
  status: string;
  proposedCapacityMw: number | null;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "totalCapacityMw:desc", label: "Capacity (High to Low)", value: "totalCapacityMw:desc" },
  { id: "totalCapacityMw:asc", label: "Capacity (Low to High)", value: "totalCapacityMw:asc" },
  { id: "state:asc", label: "State A-Z", value: "state:asc" },
  { id: "state:desc", label: "State Z-A", value: "state:desc" },
];

const fuelFilterOptions = [
  { id: "all", label: "All Fuel Types", value: "all" },
  ...FUEL_CATEGORIES.map((cat) => ({
    id: cat,
    label: FuelCategoryLabel[cat],
    value: cat,
  })),
];

const statusFilterOptions = [
  { id: "all", label: "All Statuses", value: "all" },
  { id: "operable", label: "Operable", value: "operable" },
  { id: "proposed", label: "Proposed", value: "proposed" },
];

// State abbreviations for filter dropdown
const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
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
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

export default function PowerPlantsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [sortValue, setSortValue] = useState("totalCapacityMw:desc");
  const [fuelFilter, setFuelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Parse sort value
  const [sortField, sortOrder] = sortValue.split(":") as [string, "asc" | "desc"];

  // Build API filters
  const filters = useMemo(() => {
    const f: {
      search?: string;
      state?: string;
      fuelCategory?: string;
      status?: string;
      sort?: string;
      order?: "asc" | "desc";
      limit: number;
    } = {
      limit: 200, // Max allowed by API
      sort: sortField,
      order: sortOrder,
    };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (stateFilter !== "all") f.state = stateFilter;
    if (fuelFilter !== "all") f.fuelCategory = fuelFilter;
    if (statusFilter !== "all") f.status = statusFilter;
    return f;
  }, [debouncedSearch, stateFilter, fuelFilter, statusFilter, sortField, sortOrder]);

  const { powerPlants, isLoading, error, pagination } = usePowerPlantList(filters);

  const rows: PowerPlantRow[] = useMemo(() => {
    return powerPlants.map((p) => ({
      slug: p.slug,
      name: p.name,
      fuelCategory: p.fuelCategory,
      totalCapacityMw: p.totalCapacityMw,
      state: p.state,
      utilityName: p.utilityName,
      status: p.status,
      proposedCapacityMw: p.proposedCapacityMw,
    }));
  }, [powerPlants]);

  const handleRowClick = useCallback(
    (row: PowerPlantRow) => {
      router.push(`/power-plants/${row.slug}`);
    },
    [router]
  );

  const columns: Column<PowerPlantRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: PowerPlantRow) => (
          <Link
            href={`/power-plants/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getFuelCategoryColor(row.fuelCategory) }}
            />
            {row.name}
          </Link>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "fuelCategory",
        label: "Fuel Type",
        accessor: "fuelCategory",
        render: (_value: unknown, row: PowerPlantRow) => (
          <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(row.fuelCategory)}>
            {getFuelCategoryLabel(row.fuelCategory)}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "capacity",
        label: "Capacity",
        accessor: "totalCapacityMw",
        render: (_value: unknown, row: PowerPlantRow) => (
          <span className="text-text-body">
            {row.status === "operable" ? formatCapacity(row.totalCapacityMw) : formatCapacity(row.proposedCapacityMw)}
          </span>
        ),
        mobile: { priority: 3, format: "secondary" },
      },
      {
        id: "state",
        label: "State",
        accessor: "state",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "utilityName",
        label: "Utility",
        accessor: "utilityName",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: PowerPlantRow) => (
          <Badge size="sm" shape="pill" variant={getPlantStatusBadgeVariant(row.status)}>
            {row.status === "operable" ? "Operable" : "Proposed"}
          </Badge>
        ),
        mobile: false,
      },
    ],
    []
  );

  if (isLoading && rows.length === 0) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Power Plants" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }
  const isInitialLoading = isLoading && rows.length === 0;

  if (error) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Power Plants" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="Lightning"
            title="Failed to load power plants"
            description={error.message}
            fullHeight={true}
          />
        </div>
      </PageLayout>
    );
  }

  const totalCount = pagination?.totalCount ?? rows.length;
  const showingCount = rows.length;
  const hasMore = pagination?.hasNextPage ?? false;

  return (
    <PageLayout
      className="flex flex-col h-full overflow-hidden bg-background-default"
      paddingYClass="pt-8 md:pt-12"
      paddingXClass="px-4"
    >
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <PageLayout.Header title="Power Plants" sticky={true} />
          <Button
            variant={user ? "primary" : "secondary"}
            size="md"
            isDisabled={!user}
            onPress={() => router.push("/power-plants/new")}
          >
            <Icon name="Plus" size="sm" />
            <span>Add Power Plant</span>
          </Button>
        </div>
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search plants, utilities, states..."
          resultCount={showingCount}
          resultLabel="power plants"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{
            count: showingCount,
            label: hasMore ? `power plants (${totalCount} total, showing first ${showingCount})` : "power plants",
          }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={fuelFilter}
                onChange={(e) => setFuelFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                {fuelFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All States</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No power plants found"
            description={
              searchQuery ? "Try adjusting your search or filter criteria." : "No power plants in the dataset."
            }
            fullHeight={true}
          />
        ) : (
          <>
            {isInitialLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader size={32} />
            </div>
          ) : (
            <DataTable
              className="border-r border-l"
              data={rows}
              columns={columns}
              mobileBreakpoint="md"
              isLoading={isLoading}
              height="100%"
              stickyHeader={true}
              onRowClick={handleRowClick}
            />
          )}
            {hasMore && (
              <div className="flex justify-center py-4 border-t border-border-default">
                <div className="text-sm text-text-secondary">
                  Showing first {showingCount} of {totalCount} results. Refine filters to see different plants.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
