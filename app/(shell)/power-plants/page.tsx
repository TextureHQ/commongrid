"use client";

import {
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Loader,
  PageLayout,
  TextCell,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { useCallback, useMemo, useState } from "react";
import { sortByName } from "@/lib/data";
import { usePowerPlants } from "@/lib/power-plants";
import { useFuseSearch } from "@/lib/search";
import { SearchInput } from "@/components/SearchInput";
import {
  formatCapacity,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getPlantStatusBadgeVariant,
} from "@/lib/formatting";
import { type FuelCategory, FUEL_CATEGORIES, FuelCategoryLabel, type PowerPlant } from "@/types/entities";

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
  { id: "capacity:desc", label: "Capacity (High to Low)", value: "capacity:desc" },
  { id: "capacity:asc", label: "Capacity (Low to High)", value: "capacity:asc" },
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

export default function PowerPlantsPage() {
  const router = useRouter();
  const { plants: allPlants, isLoading } = usePowerPlants();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("capacity:desc");
  const [fuelFilter, setFuelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  // Get unique states for filter
  const states = useMemo(() => {
    const s = new Set(allPlants.map((p) => p.state));
    return Array.from(s).sort();
  }, [allPlants]);

  // Fuse.js search options
  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "name", weight: 0.4 },
        { name: "utilityName", weight: 0.25 },
        { name: "slug", weight: 0.1 },
        { name: "state", weight: 0.15 },
        { name: "county", weight: 0.1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allPlants, searchQuery, fuseOptions);

  const filtered = useMemo(() => {
    let result: PowerPlant[] = searched;
    if (fuelFilter !== "all") {
      result = result.filter((p) => p.fuelCategory === fuelFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (stateFilter !== "all") {
      result = result.filter((p) => p.state === stateFilter);
    }
    // Sort only when no search query (Fuse returns relevance-ordered)
    if (!searchQuery.trim()) {
      const [field, direction] = sortValue.split(":");
      if (field === "name") {
        result = sortByName(result, direction as "asc" | "desc");
      } else if (field === "capacity") {
        result = [...result].sort((a, b) => {
          const capA = a.status === "operable" ? a.totalCapacityMw : (a.proposedCapacityMw ?? 0);
          const capB = b.status === "operable" ? b.totalCapacityMw : (b.proposedCapacityMw ?? 0);
          return direction === "desc" ? capB - capA : capA - capB;
        });
      }
    }
    return result;
  }, [searched, searchQuery, fuelFilter, statusFilter, stateFilter, sortValue]);

  const rows: PowerPlantRow[] = useMemo(
    () =>
      filtered.map((p) => ({
        slug: p.slug,
        name: p.name,
        fuelCategory: p.fuelCategory,
        totalCapacityMw: p.totalCapacityMw,
        state: p.state,
        utilityName: p.utilityName,
        status: p.status,
        proposedCapacityMw: p.proposedCapacityMw,
      })),
    [filtered]
  );

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
            {row.status === "operable"
              ? formatCapacity(row.totalCapacityMw)
              : formatCapacity(row.proposedCapacityMw)}
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

  if (isLoading) {
    return (
      <PageLayout className="flex flex-col h-full overflow-hidden bg-background-default" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
        <div className="flex-none">
          <PageLayout.Header title="Power Plants" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex flex-col h-full overflow-hidden bg-background-default" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
      <div className="flex-none">
        <PageLayout.Header title="Power Plants" sticky={true} />
        <DataSourceLink paths={["data/power-plants.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search plants, utilities, states..."
          resultCount={filtered.length}
          resultLabel="power plants"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "power plants" }}
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
                {states.map((s) => (
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
            description={searchQuery ? "Try adjusting your search or filter criteria." : "No power plants in the dataset."}
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
    </PageLayout>
  );
}
