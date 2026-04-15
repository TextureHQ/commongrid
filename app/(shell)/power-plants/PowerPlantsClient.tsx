"use client";

import { Badge, type Column, DataControls, DataTable, EmptyState, Loader, TextCell } from "@texturehq/edges";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { SearchInput } from "@/components/SearchInput";
import {
  formatCapacity,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getPlantStatusBadgeVariant,
} from "@/lib/formatting";
import { FUEL_CATEGORIES, FuelCategoryLabel, type PowerPlant } from "@/types/entities";

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

interface PowerPlantsClientProps {
  initialData: PowerPlant[];
  initialTotal: number;
  initialCursor: string | null;
  states: string[];
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "capacity:desc", label: "Capacity (High to Low)", value: "totalCapacityMw:desc" },
  { id: "capacity:asc", label: "Capacity (Low to High)", value: "totalCapacityMw:asc" },
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

export function PowerPlantsClient({ initialData, initialTotal, initialCursor, states }: PowerPlantsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-based state
  const searchQuery = searchParams.get("search") ?? "";
  const sortValue = searchParams.get("sort") ?? "totalCapacityMw:desc";
  const fuelFilter = searchParams.get("fuelCategory") ?? "all";
  const statusFilter = searchParams.get("status") ?? "all";
  const stateFilter = searchParams.get("state") ?? "all";

  // Local state for debounced search
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);

  // Data state
  const [data, setData] = useState(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Update URL params and trigger data fetch
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams);

      // Apply updates
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "all" || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset cursor when filters change
      params.delete("cursor");

      startTransition(() => {
        router.push(`/power-plants?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  // Debounced search effect
  useEffect(() => {
    if (localSearch === searchQuery) return;

    const timer = setTimeout(() => {
      setIsSearching(true);
      updateParams({ search: localSearch || undefined });
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, updateParams]);

  // Fetch data when URL changes
  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams();

      if (searchQuery) params.set("search", searchQuery);
      if (sortValue !== "totalCapacityMw:desc") params.set("sort", sortValue.split(":")[0]);
      if (sortValue !== "totalCapacityMw:desc") params.set("order", sortValue.split(":")[1]);
      if (fuelFilter !== "all") params.set("fuelCategory", fuelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (stateFilter !== "all") params.set("state", stateFilter);
      params.set("limit", "50");

      try {
        const res = await fetch(`/api/v1/power-plants?${params.toString()}`);
        const json = await res.json();

        if (json.status === "success") {
          setData(json.data);
          setTotal(json.total);
          setNextCursor(json.cursor ?? null);
          setIsSearching(false);
        }
      } catch (error) {
        console.error("Failed to fetch power plants:", error);
        setIsSearching(false);
      }
    };

    fetchData();
  }, [searchQuery, sortValue, fuelFilter, statusFilter, stateFilter]);

  // Load more (cursor pagination)
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);

    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (sortValue !== "totalCapacityMw:desc") params.set("sort", sortValue.split(":")[0]);
    if (sortValue !== "totalCapacityMw:desc") params.set("order", sortValue.split(":")[1]);
    if (fuelFilter !== "all") params.set("fuelCategory", fuelFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);
    params.set("limit", "50");
    params.set("cursor", nextCursor);

    try {
      const res = await fetch(`/api/v1/power-plants?${params.toString()}`);
      const json = await res.json();

      if (json.status === "success") {
        setData((prev) => [...prev, ...json.data]);
        setNextCursor(json.cursor ?? null);
      }
    } catch (error) {
      console.error("Failed to load more power plants:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, searchQuery, sortValue, fuelFilter, statusFilter, stateFilter]);

  const rows: PowerPlantRow[] = useMemo(
    () =>
      data.map((p) => ({
        slug: p.slug,
        name: p.name,
        fuelCategory: p.fuelCategory,
        totalCapacityMw: p.totalCapacityMw,
        state: p.state,
        utilityName: p.utilityName,
        status: p.status,
        proposedCapacityMw: p.proposedCapacityMw,
      })),
    [data]
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

  const stateFilterOptions = useMemo(
    () => [{ id: "all", label: "All States", value: "all" }, ...states.map((s) => ({ id: s, label: s, value: s }))],
    [states]
  );

  return (
    <>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={localSearch}
          onChange={setLocalSearch}
          onClear={() => {
            setLocalSearch("");
            updateParams({ search: undefined });
          }}
          placeholder="Search plants, utilities, states..."
          resultCount={total}
          resultLabel="power plants"
        />
        {isSearching && (
          <div className="flex items-center gap-2 mt-2 text-sm text-text-muted">
            <Loader size={14} />
            <span>Searching...</span>
          </div>
        )}
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: total, label: "power plants" }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: (value) => updateParams({ sort: value }),
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={fuelFilter}
                onChange={(e) => updateParams({ fuelCategory: e.target.value })}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
                disabled={isPending}
              >
                {fuelFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => updateParams({ status: e.target.value })}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
                disabled={isPending}
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={stateFilter}
                onChange={(e) => updateParams({ state: e.target.value })}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
                disabled={isPending}
              >
                {stateFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 && !isPending ? (
          <EmptyState
            icon="Lightning"
            title="No power plants found"
            description={
              searchQuery ? "Try adjusting your search or filter criteria." : "No power plants in the dataset."
            }
            fullHeight={true}
          />
        ) : (
          <div className="relative h-full">
            <DataTable
              className="border-r border-l"
              data={rows}
              columns={columns}
              mobileBreakpoint="md"
              isLoading={isPending}
              height="100%"
              stickyHeader={true}
              onRowClick={handleRowClick}
            />
            {nextCursor && (
              <div className="sticky bottom-0 left-0 right-0 bg-background-surface border-t border-border-default p-4 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader size={16} />
                      Loading more...
                    </span>
                  ) : (
                    `Load more (${total - rows.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
