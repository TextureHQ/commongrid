"use client";

import {
  Badge,
  type Column,
  DataControls,
  DataTable,
  Loader,
  PageLayout,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { useCallback, useMemo, useState } from "react";
import { useEvCharging } from "@/lib/ev-charging";
import { useFuseSearch } from "@/lib/search";
import { SearchInput } from "@/components/SearchInput";
import {
  type EVStation,
  getNetworkColor,
  getNetworkShortName,
  getStatusLabel,
  getAccessLabel,
  getTotalConnectors,
} from "@/types/ev-charging";

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

const sortOptions = [
  { id: "name:asc", label: "Name ▲", value: "name:asc" },
  { id: "name:desc", label: "Name ▼", value: "name:desc" },
  { id: "connectors:desc", label: "Connectors ▼", value: "connectors:desc" },
  { id: "dcfast:desc", label: "DC Fast ▼", value: "dcfast:desc" },
  { id: "state:asc", label: "State ▲", value: "state:asc" },
];

function getStatusBadgeVariant(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "E": return "success";
    case "P": return "info";
    case "T": return "warning";
    default: return "neutral";
  }
}

function getAccessBadgeVariant(access: string): "info" | "neutral" | "warning" {
  switch (access) {
    case "public": return "info";
    case "private": return "neutral";
    case "restricted": return "warning";
    default: return "neutral";
  }
}

export default function EVChargingPage() {
  const router = useRouter();
  const { stations: allStations, isLoading } = useEvCharging();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [accessFilter, setAccessFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  // Unique states for filter
  const states = useMemo(() => {
    const s = new Set(allStations.map((s) => s.state));
    return Array.from(s).sort();
  }, [allStations]);

  // Unique networks for filter (top networks by count)
  const networks = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of allStations) {
      const net = s.evNetwork ?? "Non-Networked";
      n.set(net, (n.get(net) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [allStations]);

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "stationName", weight: 0.5 },
        { name: "city", weight: 0.2 },
        { name: "state", weight: 0.15 },
        { name: "evNetwork", weight: 0.1 },
        { name: "streetAddress", weight: 0.05 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allStations, searchQuery, fuseOptions);

  const filtered = useMemo(() => {
    let result: EVStation[] = searched;
    if (accessFilter !== "all") {
      result = result.filter((s) => s.accessCode === accessFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((s) => s.statusCode === statusFilter);
    }
    if (networkFilter !== "all") {
      const net = networkFilter;
      result = result.filter((s) => (s.evNetwork ?? "Non-Networked") === net);
    }
    if (levelFilter === "dcfast") {
      result = result.filter((s) => s.evDcFastNum > 0);
    } else if (levelFilter === "level2") {
      result = result.filter((s) => s.evLevel2EvseNum > 0);
    }
    if (stateFilter !== "all") {
      result = result.filter((s) => s.state === stateFilter);
    }
    if (!searchQuery.trim()) {
      const [field, direction] = sortValue.split(":");
      if (field === "name") {
        result = [...result].sort((a, b) =>
          direction === "asc"
            ? a.stationName.localeCompare(b.stationName)
            : b.stationName.localeCompare(a.stationName)
        );
      } else if (field === "connectors") {
        result = [...result].sort((a, b) => getTotalConnectors(b) - getTotalConnectors(a));
      } else if (field === "dcfast") {
        result = [...result].sort((a, b) => b.evDcFastNum - a.evDcFastNum);
      } else if (field === "state") {
        result = [...result].sort((a, b) => a.state.localeCompare(b.state));
      }
    }
    return result;
  }, [searched, searchQuery, accessFilter, statusFilter, networkFilter, levelFilter, stateFilter, sortValue]);

  const rows: EVStationRow[] = useMemo(
    () =>
      filtered.map((s) => ({
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
    [filtered]
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
            <span className="hyphens-auto">{row.stationName}</span>
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
          <span className="text-text-body">{row.city}, {row.state}</span>
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
      <PageLayout className="flex flex-col h-full overflow-hidden bg-background-default" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
        <div className="flex-none">
          <PageLayout.Header title="EV Charging Stations" sticky={true} />
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
        <PageLayout.Header
          title="EV Charging Stations"
          subtitle={`${allStations.length.toLocaleString()} stations`}
          sticky={true}
        />
        <DataSourceLink paths={["data/ev-charging.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search stations, networks, cities..."
          resultCount={filtered.length}
          resultLabel="stations"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "stations" }}
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
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
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
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Charging Levels</option>
                <option value="dcfast">DC Fast Only</option>
                <option value="level2">Level 2</option>
              </select>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Access Types</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="restricted">Restricted</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Statuses</option>
                <option value="E">Open</option>
                <option value="P">Planned</option>
                <option value="T">Temporarily Unavailable</option>
              </select>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
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
      </div>
    </PageLayout>
  );
}
