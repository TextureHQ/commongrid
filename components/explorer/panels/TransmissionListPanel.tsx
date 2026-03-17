"use client";

import {
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Loader,
} from "@texturehq/edges";
import { useMemo } from "react";
import { useExplorer } from "../ExplorerContext";
import { useTransmissionLines } from "@/lib/transmission-lines";
import { useFuseSearch } from "@/lib/search";
import {
  type TransmissionLine,
  type VoltageClass,
  VOLTAGE_CLASSES,
  VoltageClassLabel,
} from "@/types/transmission-lines";

interface TransmissionLineRow extends Record<string, unknown> {
  objectId: number;
  id: string;
  owner: string;
  voltage: number | null;
  voltageClass: VoltageClass;
  status: string;
  lengthMiles: number;
  sub1: string;
  sub2: string;
}

const voltageClassFilterOptions = [
  { id: "all", label: "All Voltage Classes", value: "all" },
  ...VOLTAGE_CLASSES.map((vc) => ({
    id: vc,
    label: VoltageClassLabel[vc],
    value: vc,
  })),
];

function getVoltageBadgeVariant(vc: VoltageClass): "error" | "warning" | "success" | "info" | "neutral" {
  switch (vc) {
    case "extra-high":
      return "error";
    case "high":
      return "warning";
    case "medium":
      return "success";
    case "sub-trans":
      return "info";
    default:
      return "neutral";
  }
}

function getVoltageShortLabel(vc: VoltageClass): string {
  switch (vc) {
    case "extra-high":
      return "345kV+";
    case "high":
      return "230–344kV";
    case "medium":
      return "115–229kV";
    case "sub-trans":
      return "69–114kV";
    default:
      return "Unknown";
  }
}

export function TransmissionListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const { lines: allLines, isLoading } = useTransmissionLines();

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "owner", weight: 0.5 },
        { name: "id", weight: 0.2 },
        { name: "sub1", weight: 0.15 },
        { name: "sub2", weight: 0.15 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allLines, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: TransmissionLine[] = searched;
    if (state.type !== "all") {
      result = result.filter((l) => l.voltageClass === state.type);
    }
    // Sort by voltage desc when no search query
    if (!state.q.trim()) {
      result = [...result].sort((a, b) => (b.voltage ?? -1) - (a.voltage ?? -1));
    }
    return result;
  }, [searched, state.q, state.type]);

  const rows: TransmissionLineRow[] = useMemo(
    () =>
      filtered.map((l) => ({
        objectId: l.objectId,
        id: l.id,
        owner: l.owner,
        voltage: l.voltage,
        voltageClass: l.voltageClass,
        status: l.status,
        lengthMiles: l.lengthMiles,
        sub1: l.sub1,
        sub2: l.sub2,
      })),
    [filtered]
  );

  const columns: Column<TransmissionLineRow>[] = useMemo(
    () => [
      {
        id: "owner",
        label: "Owner",
        accessor: "owner",
        render: (_value: unknown, row: TransmissionLineRow) => (
          <span className="font-medium text-text-body">{row.owner || "—"}</span>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "voltageClass",
        label: "Voltage",
        accessor: "voltageClass",
        render: (_value: unknown, row: TransmissionLineRow) => (
          <div className="flex flex-col gap-0.5">
            <Badge size="sm" shape="pill" variant={getVoltageBadgeVariant(row.voltageClass)}>
              {getVoltageShortLabel(row.voltageClass)}
            </Badge>
            {row.voltage != null && row.voltage > 0 && (
              <span className="text-xs text-text-muted">{row.voltage} kV</span>
            )}
          </div>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "lengthMiles",
        label: "Length",
        accessor: "lengthMiles",
        render: (_value: unknown, row: TransmissionLineRow) => (
          <span className="text-text-body">
            {row.lengthMiles > 0 ? `${row.lengthMiles.toFixed(1)} mi` : "—"}
          </span>
        ),
        mobile: { priority: 3, format: "secondary" },
      },
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: TransmissionLineRow) => (
          <Badge
            size="sm"
            shape="pill"
            variant={
              row.status.toLowerCase().includes("in service") &&
              !row.status.toLowerCase().includes("not")
                ? "success"
                : row.status.toLowerCase().includes("not in service")
                  ? "error"
                  : row.status.toLowerCase().includes("construction")
                    ? "warning"
                    : "neutral"
            }
          >
            {row.status || "Unknown"}
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
        <DataControls
          resultsCount={{ count: filtered.length, label: "lines" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search by owner, ID, substation...",
          }}
          customControls={
            <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
            >
              {voltageClassFilterOptions.map((opt) => (
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
            title="No transmission lines found"
            description={
              state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No transmission lines in the dataset."
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
          />
        )}
      </div>
    </div>
  );
}
