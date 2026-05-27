"use client";

import { Badge, Button, type Column, DataControls, DataTable, Icon, Loader, PageLayout } from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { SearchInput } from "@/components/SearchInput";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { EVStation } from "@/types/ev-charging";
import { getAccessLabel, getNetworkColor, getNetworkShortName, getStatusLabel } from "@/types/ev-charging";

interface EVStationRow extends Record<string, unknown> {
  slug: string;
  stationName: string;
  evNetwork: string | null;
  city: string;
  state: string;
  evLevel2EvseNum: number;
  evDcFastNum: number;
  accessCode: string;
  statusCode: string;
}

interface PaginationMeta {
  totalCount: number;
  nextCursor: string | null;
  limit: number;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "state:asc", label: "State A-Z", value: "state:asc" },
];

function getStatusBadgeVariant(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "E":
      return "success";
    case "P":
      return "info";
    case "T":
      return "warning";
    default:
      return "neutral";
  }
}

function getAccessBadgeVariant(access: string): "info" | "neutral" | "warning" {
  switch (access) {
    case "public":
      return "info";
    case "private":
      return "neutral";
    case "restricted":
      return "warning";
    default:
      return "neutral";
  }
}

export default function EVChargingPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [isPending, startTransition] = useTransition();

  // State
  const [stations, setStations] = useState<EVStation[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ totalCount: 0, nextCursor: null, limit: 100 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [accessFilter, setAccessFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextPagePrefetchedRef = useRef(false);

  // Unique networks for filter (derive from current results)
  const networks = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of stations) {
      const net = s.evNetwork ?? "Non-Networked";
      n.set(net, (n.get(net) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [stations]);

  // Unique states for filter
  const states = useMemo(() => {
    const s = new Set(stations.map((s) => s.state));
    return Array.from(s).sort();
  }, [stations]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Fetch data when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (accessFilter !== "all") params.set("accessCode", accessFilter);
    if (statusFilter !== "all") params.set("statusCode", statusFilter);
    if (networkFilter !== "all") params.set("network", networkFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);

    const [field, direction] = sortValue.split(":");
    if (field === "name") params.set("sort", "stationName");
    else if (field === "state") params.set("sort", "state");
    params.set("order", direction);
    params.set("limit", "100");

    startTransition(async () => {
      setIsLoading(true);
      const res = await fetch(`/api/v1/ev-stations?${params.toString()}`);
      const data = await res.json();
      setStations(data.data ?? []);
      setMeta({
        totalCount: data.pagination?.total ?? 0,
        nextCursor: data.pagination?.cursor ?? null,
        limit: data.pagination?.limit ?? 100,
      });
      setIsLoading(false);
      nextPagePrefetchedRef.current = false;
    });
  }, [debouncedSearch, sortValue, accessFilter, statusFilter, networkFilter, stateFilter]);

  // Aggressive prefetch of next page
  useEffect(() => {
    if (meta.nextCursor && !nextPagePrefetchedRef.current && !isLoadingMore && !isLoading) {
      nextPagePrefetchedRef.current = true;
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (accessFilter !== "all") params.set("accessCode", accessFilter);
      if (statusFilter !== "all") params.set("statusCode", statusFilter);
      if (networkFilter !== "all") params.set("network", networkFilter);
      if (stateFilter !== "all") params.set("state", stateFilter);

      const [field, direction] = sortValue.split(":");
      if (field === "name") params.set("sort", "stationName");
      else if (field === "state") params.set("sort", "state");
      params.set("order", direction);
      params.set("limit", "100");
      params.set("cursor", meta.nextCursor);

      // Prefetch in the background
      fetch(`/api/v1/ev-stations?${params.toString()}`);
    }
  }, [
    meta.nextCursor,
    isLoadingMore,
    isLoading,
    debouncedSearch,
    sortValue,
    accessFilter,
    statusFilter,
    networkFilter,
    stateFilter,
  ]);

  const loadMore = useCallback(async () => {
    if (!meta.nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (accessFilter !== "all") params.set("accessCode", accessFilter);
    if (statusFilter !== "all") params.set("statusCode", statusFilter);
    if (networkFilter !== "all") params.set("network", networkFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);

    const [field, direction] = sortValue.split(":");
    if (field === "name") params.set("sort", "stationName");
    else if (field === "state") params.set("sort", "state");
    params.set("order", direction);
    params.set("limit", "100");
    params.set("cursor", meta.nextCursor);

    const res = await fetch(`/api/v1/ev-stations?${params.toString()}`);
    const data = await res.json();

    setStations((prev) => [...prev, ...(data.data ?? [])]);
    setMeta({
      totalCount: data.pagination?.total ?? 0,
      nextCursor: data.pagination?.cursor ?? null,
      limit: data.pagination?.limit ?? 100,
    });
    setIsLoadingMore(false);
    nextPagePrefetchedRef.current = false;
  }, [
    meta.nextCursor,
    isLoadingMore,
    debouncedSearch,
    sortValue,
    accessFilter,
    statusFilter,
    networkFilter,
    stateFilter,
  ]);

  const rows: EVStationRow[] = useMemo(
    () =>
      stations.map((s) => ({
        slug: s.slug,
        stationName: s.stationName,
        evNetwork: s.evNetwork,
        city: s.city,
        state: s.state,
        evLevel2EvseNum: s.evLevel2EvseNum,
        evDcFastNum: s.evDcFastNum,
        accessCode: s.accessCode,
        statusCode: s.statusCode,
      })),
    [stations]
  );

  const handleRowClick = useCallback(
    (row: EVStationRow) => {
      router.push(`/ev-charging/${row.slug}`);
    },
    [router]
  );

  const columns: Column<EVStationRow>[] = useMemo(
    () => [
      {
        id: "stationName",
        label: "Station",
        accessor: "stationName",
        render: (_value: unknown, row: EVStationRow) => (
          <Link
            href={`/ev-charging/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getNetworkColor(row.evNetwork) }}
            />
            {row.stationName}
          </Link>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "network",
        label: "Network",
        accessor: "evNetwork",
        render: (_value: unknown, row: EVStationRow) => (
          <span className="text-sm text-text-body">{getNetworkShortName(row.evNetwork)}</span>
        ),
        mobile: { priority: 2, format: "secondary" },
      },
      {
        id: "location",
        label: "Location",
        accessor: "city",
        render: (_value: unknown, row: EVStationRow) => (
          <span className="text-text-body">
            {row.city}, {row.state}
          </span>
        ),
        mobile: { priority: 3, format: "secondary" },
      },
      {
        id: "charging",
        label: "Charging",
        accessor: "evDcFastNum",
        render: (_value: unknown, row: EVStationRow) => (
          <span className="text-sm text-text-body">
            {row.evDcFastNum > 0 ? `${row.evDcFastNum} DC Fast` : ""}
            {row.evDcFastNum > 0 && row.evLevel2EvseNum > 0 ? " · " : ""}
            {row.evLevel2EvseNum > 0 ? `${row.evLevel2EvseNum} L2` : ""}
            {row.evDcFastNum === 0 && row.evLevel2EvseNum === 0 ? "L1 only" : ""}
          </span>
        ),
        mobile: false,
      },
      {
        id: "access",
        label: "Access",
        accessor: "accessCode",
        render: (_value: unknown, row: EVStationRow) => (
          <Badge size="sm" shape="pill" variant={getAccessBadgeVariant(row.accessCode)}>
            {getAccessLabel(row.accessCode as "public" | "private" | "restricted")}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "status",
        label: "Status",
        accessor: "statusCode",
        render: (_value: unknown, row: EVStationRow) => (
          <Badge size="sm" shape="pill" variant={getStatusBadgeVariant(row.statusCode)}>
            {getStatusLabel(row.statusCode as "E" | "P" | "T")}
          </Badge>
        ),
        mobile: false,
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <div className="flex items-center justify-between">
            <PageLayout.Header title="EV Charging Stations" sticky={true} />
            <Button
              variant={user ? "primary" : "secondary"}
              size="md"
              isDisabled={!user}
              onPress={() => router.push("/ev-charging/new")}
            >
              <Icon name="Plus" size="sm" />
              <span>Add EV Station</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      className="flex flex-col h-full overflow-hidden bg-background-default"
      paddingYClass="pt-8 md:pt-12"
      paddingXClass="px-4"
    >
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <PageLayout.Header
            title="EV Charging Stations"
            subtitle={`${meta.totalCount.toLocaleString()} stations`}
            sticky={true}
          />
          <Button
            variant={user ? "primary" : "secondary"}
            size="md"
            isDisabled={!user}
            onPress={() => router.push("/ev-charging/new")}
          >
            <Icon name="Plus" size="sm" />
            <span>Add EV Station</span>
          </Button>
        </div>
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search stations, networks, cities..."
          resultCount={stations.length}
          resultLabel="stations"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: stations.length, label: "loaded" }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={networkFilter}
                onChange={(e) => setNetworkFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Networks</option>
                {networks.slice(0, 20).map((net) => (
                  <option key={net} value={net}>
                    {getNetworkShortName(net)}
                  </option>
                ))}
              </select>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Charging Levels</option>
                <option value="dcfast">DC Fast Only</option>
                <option value="level2">Level 2</option>
              </select>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Access Types</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="restricted">Restricted</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Statuses</option>
                <option value="E">Open</option>
                <option value="P">Planned</option>
                <option value="T">Temporarily Unavailable</option>
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
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable
          className="border-r border-l flex-1"
          data={rows}
          columns={columns}
          mobileBreakpoint="md"
          isLoading={isPending}
          height="100%"
          stickyHeader={true}
          onRowClick={handleRowClick}
        />
        {meta.nextCursor && (
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
                : `Load More (${(meta.totalCount - stations.length).toLocaleString()} remaining)`}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
