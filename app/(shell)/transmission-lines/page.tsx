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
import { useEffect, useMemo, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { useTransmissionLineList } from "@/hooks/useTransmissionLineList";
import { VOLTAGE_CLASSES, type VoltageClass, VoltageClassLabel } from "@/types/transmission-lines";

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
  { id: "lengthMiles:desc", label: "Length (Longest First)", value: "lengthMiles:desc" },
  { id: "lengthMiles:asc", label: "Length (Shortest First)", value: "lengthMiles:asc" },
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

function getVoltageClassShortLabel(vc: VoltageClass): string {
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

export default function TransmissionLinesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState("voltage:desc");
  const [voltageFilter, setVoltageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Parse sort
  const [sortField, sortOrder] = sortValue.split(":") as [string, "asc" | "desc"];

  // Build API filters
  const filters = useMemo(() => {
    const f: {
      search?: string;
      voltageClass?: string;
      status?: string;
      sort?: string;
      order?: "asc" | "desc";
      limit: number;
    } = {
      limit: 200,
      sort: sortField,
      order: sortOrder,
    };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (voltageFilter !== "all") f.voltageClass = voltageFilter;
    if (statusFilter !== "all") f.status = statusFilter;
    return f;
  }, [debouncedSearch, voltageFilter, statusFilter, sortField, sortOrder]);

  const { transmissionLines, isLoading, error, pagination } = useTransmissionLineList(filters);

  const rows: TransmissionLineRow[] = useMemo(
    () =>
      transmissionLines.map((l) => ({
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
    [transmissionLines]
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
              row.status.toLowerCase().includes("in service") && !row.status.toLowerCase().includes("not")
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
          <span className="text-text-body">{row.lengthMiles > 0 ? `${row.lengthMiles.toFixed(1)} mi` : "—"}</span>
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
          <PageLayout.Header title="Transmission Lines" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Transmission Lines" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="Lightning"
            title="Failed to load transmission lines"
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
        <PageLayout.Header title="Transmission Lines" sticky={true} />

      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search by owner, ID, or substation..."
          resultCount={showingCount}
          resultLabel="lines"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{
            count: showingCount,
            label: hasMore
              ? `transmission lines (${totalCount} total, showing first ${showingCount})`
              : "transmission lines",
          }}
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
            description={
              searchQuery ? "Try adjusting your search or filter criteria." : "No transmission lines in the dataset."
            }
            fullHeight={true}
          />
        ) : (
          <>
            <DataTable
              className="border-r border-l"
              data={rows}
              columns={columns}
              mobileBreakpoint="md"
              isLoading={isLoading}
              height="100%"
              stickyHeader={true}
            />
            {hasMore && (
              <div className="flex justify-center py-4 border-t border-border-default">
                <div className="text-sm text-text-secondary">
                  Showing first {showingCount} of {totalCount} results. Refine filters to see different lines.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
