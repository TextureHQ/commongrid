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
import { DataSourceLink } from "@/components/DataSourceLink";
import { useMemo, useState } from "react";
import { useTransmissionLines } from "@/lib/transmission-lines";
import { useFuseSearch } from "@/lib/search";
import { SearchInput } from "@/components/SearchInput";
import { type TransmissionLine, type VoltageClass, VOLTAGE_CLASSES, VoltageClassLabel } from "@/types/transmission-lines";

interface TransmissionLineRow extends Record<string, unknown> {
  objectId: number;
  id: string;
  owner: string;
  voltage: number | null;
  voltageClass: VoltageClass;
  status: string;
  type: string;
  lengthMiles: number;
  sub1: string;
  sub2: string;
}

const sortOptions = [
  { id: "voltage:desc", label: "Voltage (High to Low)", value: "voltage:desc" },
  { id: "voltage:asc", label: "Voltage (Low to High)", value: "voltage:asc" },
  { id: "length:desc", label: "Length (Longest First)", value: "length:desc" },
  { id: "length:asc", label: "Length (Shortest First)", value: "length:asc" },
  { id: "owner:asc", label: "Owner A-Z", value: "owner:asc" },
];

const voltageClassFilterOptions = [
  { id: "all", label: "All Voltage Classes", value: "all" },
  ...VOLTAGE_CLASSES.map((vc) => ({
    id: vc,
    label: VoltageClassLabel[vc],
    value: vc,
  })),
];

const statusFilterOptions = [
  { id: "all", label: "All Statuses", value: "all" },
  { id: "in service", label: "In Service", value: "in service" },
  { id: "not in service", label: "Not In Service", value: "not in service" },
  { id: "under construction", label: "Under Construction", value: "under construction" },
];

function getVoltageBadgeVariant(vc: VoltageClass): "error" | "warning" | "success" | "info" | "neutral" {
  switch (vc) {
    case "extra-high": return "error";
    case "high": return "warning";
    case "medium": return "success";
    case "sub-trans": return "info";
    default: return "neutral";
  }
}

function getVoltageClassShortLabel(vc: VoltageClass): string {
  switch (vc) {
    case "extra-high": return "345kV+";
    case "high": return "230–344kV";
    case "medium": return "115–229kV";
    case "sub-trans": return "69–114kV";
    default: return "Unknown";
  }
}

export default function TransmissionLinesPage() {
  const { lines: allLines, isLoading } = useTransmissionLines();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("voltage:desc");
  const [voltageFilter, setVoltageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const searched = useFuseSearch(allLines, searchQuery, fuseOptions);

  const filtered = useMemo(() => {
    let result: TransmissionLine[] = searched;
    if (voltageFilter !== "all") {
      result = result.filter((l) => l.voltageClass === voltageFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((l) => l.status.toLowerCase().includes(statusFilter.toLowerCase()));
    }
    // Sort only when not fuzzy-searching
    if (!searchQuery.trim()) {
      const [field, direction] = sortValue.split(":");
      result = [...result].sort((a, b) => {
        if (field === "voltage") {
          const va = a.voltage ?? -1;
          const vb = b.voltage ?? -1;
          return direction === "desc" ? vb - va : va - vb;
        }
        if (field === "length") {
          return direction === "desc" ? b.lengthMiles - a.lengthMiles : a.lengthMiles - b.lengthMiles;
        }
        if (field === "owner") {
          return direction === "asc"
            ? (a.owner ?? "").localeCompare(b.owner ?? "")
            : (b.owner ?? "").localeCompare(a.owner ?? "");
        }
        return 0;
      });
    }
    return result;
  }, [searched, searchQuery, voltageFilter, statusFilter, sortValue]);

  const rows: TransmissionLineRow[] = useMemo(
    () =>
      filtered.map((l) => ({
        objectId: l.objectId,
        id: l.id,
        owner: l.owner,
        voltage: l.voltage,
        voltageClass: l.voltageClass,
        status: l.status,
        type: l.type,
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
        cell: TextCell,
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "voltageClass",
        label: "Voltage",
        accessor: "voltageClass",
        render: (_value: unknown, row: TransmissionLineRow) => (
          <div className="flex flex-col gap-0.5">
            <Badge size="sm" shape="pill" variant={getVoltageBadgeVariant(row.voltageClass)}>
              {getVoltageClassShortLabel(row.voltageClass)}
            </Badge>
            {row.voltage != null && row.voltage > 0 && (
              <span className="text-xs text-text-muted">{row.voltage} kV</span>
            )}
          </div>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "type",
        label: "Type",
        accessor: "type",
        cell: TextCell,
        mobile: false,
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
              row.status.toLowerCase().includes("in service") && !row.status.toLowerCase().includes("not") ? "success" :
              row.status.toLowerCase().includes("not in service") ? "error" :
              row.status.toLowerCase().includes("construction") ? "warning" :
              "neutral"
            }
          >
            {row.status || "Unknown"}
          </Badge>
        ),
        mobile: { priority: 3, format: "secondary" },
      },
      {
        id: "sub1",
        label: "Substation 1",
        accessor: "sub1",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "sub2",
        label: "Substation 2",
        accessor: "sub2",
        cell: TextCell,
        mobile: false,
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
        mobile: false,
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <PageLayout className="flex flex-col h-full overflow-hidden bg-background-default" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
        <div className="flex-none">
          <PageLayout.Header title="Transmission Lines" sticky={true} />
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
        <PageLayout.Header title="Transmission Lines" sticky={true} />
        <DataSourceLink paths={["data/transmission-lines.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search by owner, ID, or substation..."
          resultCount={filtered.length}
          resultLabel="lines"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "transmission lines" }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={voltageFilter}
                onChange={(e) => setVoltageFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                {voltageClassFilterOptions.map((opt) => (
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
            </div>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No transmission lines found"
            description={searchQuery ? "Try adjusting your search or filter criteria." : "No transmission lines in the dataset."}
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
          />
        )}
      </div>
    </PageLayout>
  );
}
