"use client";

import {
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Loader,
  useTableExport,
} from "@texturehq/edges";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useExplorer } from "../ExplorerContext";
import { usePowerPlants } from "@/lib/power-plants";
import { useFuseSearch } from "@/lib/search";
import { sortByName } from "@/lib/data";
import {
  formatCapacity,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
} from "@/lib/formatting";
import { type PowerPlant, FUEL_CATEGORIES, FuelCategoryLabel } from "@/types/entities";

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

const fuelFilterOptions = [
  { id: "all", label: "All Fuel Types", value: "all" },
  ...FUEL_CATEGORIES.map((cat) => ({
    id: cat,
    label: FuelCategoryLabel[cat],
    value: cat,
  })),
];

export function PowerPlantListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { plants: allPlants, isLoading } = usePowerPlants();

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

  const searched = useFuseSearch(allPlants, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: PowerPlant[] = searched;
    if (state.type !== "all") {
      result = result.filter((p) => p.fuelCategory === state.type);
    }
    // Sort by capacity desc when no search query
    if (!state.q.trim()) {
      result = [...result].sort((a, b) => {
        const capA = a.status === "operable" ? a.totalCapacityMw : (a.proposedCapacityMw ?? 0);
        const capB = b.status === "operable" ? b.totalCapacityMw : (b.proposedCapacityMw ?? 0);
        return capB - capA;
      });
    }
    return result;
  }, [searched, state.q, state.type]);

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
          <span className="flex items-center gap-2 font-medium text-text-body">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getFuelCategoryColor(row.fuelCategory) }}
            />
            {row.name}
          </span>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "fuelCategory",
        label: "Fuel",
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
        render: (_value: unknown, row: PowerPlantRow) => (
          <span className="text-text-body">{row.state}</span>
        ),
        mobile: false,
      },
    ],
    []
  );

  const exportColumns: Column<PowerPlantRow>[] = useMemo(
    () => [
      { id: "name", label: "Name", accessor: "name" },
      { id: "fuelCategory", label: "Fuel Category", accessor: "fuelCategory" },
      { id: "totalCapacityMw", label: "Capacity (MW)", accessor: "totalCapacityMw" },
      { id: "state", label: "State", accessor: "state" },
      { id: "utilityName", label: "Utility", accessor: "utilityName" },
      { id: "status", label: "Status", accessor: "status" },
      { id: "slug", label: "Slug", accessor: "slug" },
    ],
    []
  );

  const { exportCSV, canExport } = useTableExport({
    columns: exportColumns,
    data: rows,
    metadata: { filename: "opengrid-power-plants" },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: filtered.length, label: "power plants" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search plants, utilities, states...",
          }}
          customControls={
            <div className="flex items-center gap-1">
              <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
            >
              {fuelFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No power plants in the dataset."
            }
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
    </div>
  );
}
