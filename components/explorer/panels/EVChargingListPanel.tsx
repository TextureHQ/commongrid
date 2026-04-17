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
  Tooltip,
} from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEvCharging } from "@/lib/ev-charging";
import { useFuseSearch } from "@/lib/search";
import type { EVStation } from "@/types/ev-charging";
import { EV_NETWORKS, getNetworkColor, getNetworkShortName, getStatusLabel } from "@/types/ev-charging";
import { useExplorer } from "../ExplorerContext";

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

const networkFilterOptions = [
  { id: "all", label: "All Networks", value: "all" },
  ...EV_NETWORKS.map((n) => ({ id: n.id, label: n.label, value: n.id })),
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

export function EVChargingListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { stations: allStations, isLoading } = useEvCharging();

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "stationName", weight: 0.4 },
        { name: "city", weight: 0.2 },
        { name: "state", weight: 0.15 },
        { name: "evNetwork", weight: 0.15 },
        { name: "slug", weight: 0.1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allStations, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: EVStation[] = searched;
    if (state.type !== "all") {
      result = result.filter((s) => s.evNetwork === state.type);
    }
    // Sort by DC fast charger count desc when no search
    if (!state.q.trim()) {
      result = [...result].sort((a, b) => b.evDcFastNum - a.evDcFastNum);
    }
    return result;
  }, [searched, state.q, state.type]);

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
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getNetworkColor(row.evNetwork) }}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-medium text-text-body truncate">{row.stationName}</span>
              <span className="text-xs text-text-muted">
                {row.city}, {row.state}
              </span>
            </div>
          </div>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "evNetwork",
        label: "Network",
        accessor: "evNetwork",
        render: (_value: unknown, row: EVStationRow) => (
          <Badge size="sm" shape="pill" variant="default">
            {getNetworkShortName(row.evNetwork)}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "connectors",
        label: "Connectors",
        accessor: "evDcFastNum",
        render: (_value: unknown, row: EVStationRow) => (
          <div className="flex flex-col gap-0.5 text-sm">
            {row.evDcFastNum > 0 && <span className="text-text-body">{row.evDcFastNum} DC Fast</span>}
            {row.evLevel2EvseNum > 0 && <span className="text-text-muted">{row.evLevel2EvseNum} L2</span>}
          </div>
        ),
        mobile: { priority: 3, format: "secondary" },
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
      <div className="flex items-center justify-center h-full">
        <Loader size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-text-heading">EV Charging Stations</span>
          {user ? (
            <Button variant="primary" size="sm" onPress={() => router.push("/ev-charging/new")}>
              <Icon name="Plus" size="sm" />
              <span>Add New</span>
            </Button>
          ) : (
            <Tooltip content="Sign in to add entities">
              <Button variant="secondary" size="sm" isDisabled>
                <Icon name="Plus" size="sm" />
                <span>Add New</span>
              </Button>
            </Tooltip>
          )}
        </div>
        <DataControls
          resultsCount={{ count: filtered.length, label: "stations" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search stations, cities, networks...",
          }}
          customControls={
            <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
            >
              {networkFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No EV charging stations found"
            description={
              state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No EV charging stations in the dataset."
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
