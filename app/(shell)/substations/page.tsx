"use client";

/**
 * Substations list page: /substations
 *
 * Browse US electric substations via the paginated /api/v1/substations API.
 * Uses a "Load more" pattern (cursor pagination) rather than preloading all
 * 60k+ rows like transmission-lines / pricing-nodes, since substations are
 * served from the database rather than a static JSON on disk.
 */

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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchInput } from "@/components/SearchInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoltageBand = "extra-high" | "high" | "medium" | "sub-trans" | "unknown";
type SubstationType = "transmission" | "distribution" | "hybrid" | "unknown";
type SubstationStatus = "in_service" | "out_of_service" | "planned" | "retired" | "unknown";

interface SubstationApiRow {
  id: string;
  slug: string;
  name: string;
  ownerName: string | null;
  state: string;
  county: string | null;
  latitude: number;
  longitude: number;
  minVoltageKv: number | null;
  maxVoltageKv: number | null;
  voltageBand: VoltageBand;
  substationType: SubstationType;
  status: SubstationStatus;
  source: string;
}

interface SubstationRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  state: string;
  voltageDisplay: string;
  voltageBand: VoltageBand;
  substationType: SubstationType;
  status: SubstationStatus;
}

interface SubstationsApiResponse {
  data: SubstationApiRow[];
  pagination: {
    cursor: string | null;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const VOLTAGE_BAND_LABELS: Record<VoltageBand, string> = {
  "extra-high": "Extra High (345kV+)",
  high: "High (230–344kV)",
  medium: "Medium (115–229kV)",
  "sub-trans": "Sub-Transmission (69–114kV)",
  unknown: "Unknown",
};

const SUBSTATION_TYPE_LABELS: Record<SubstationType, string> = {
  transmission: "Transmission",
  distribution: "Distribution",
  hybrid: "Hybrid",
  unknown: "Unknown",
};

const STATUS_LABELS: Record<SubstationStatus, string> = {
  in_service: "In Service",
  out_of_service: "Out of Service",
  planned: "Planned",
  retired: "Retired",
  unknown: "Unknown",
};

function getVoltageBandVariant(band: VoltageBand): "success" | "info" | "warning" | "neutral" {
  switch (band) {
    case "extra-high":
      return "warning";
    case "high":
      return "info";
    case "medium":
      return "info";
    case "sub-trans":
      return "neutral";
    default:
      return "neutral";
  }
}

function getStatusVariant(status: SubstationStatus): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "in_service":
      return "success";
    case "planned":
      return "info";
    case "out_of_service":
    case "retired":
      return "warning";
    default:
      return "neutral";
  }
}

function formatVoltage(row: SubstationApiRow): string {
  const { minVoltageKv, maxVoltageKv } = row;
  if (minVoltageKv != null && maxVoltageKv != null) {
    if (minVoltageKv === maxVoltageKv) return `${maxVoltageKv}kV`;
    return `${minVoltageKv}–${maxVoltageKv}kV`;
  }
  if (maxVoltageKv != null) return `${maxVoltageKv}kV`;
  if (minVoltageKv != null) return `${minVoltageKv}kV`;
  return "—";
}

function toRow(r: SubstationApiRow): SubstationRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    ownerName: r.ownerName ?? "—",
    state: r.state ?? "—",
    voltageDisplay: formatVoltage(r),
    voltageBand: r.voltageBand,
    substationType: r.substationType,
    status: r.status,
  };
}

// ---------------------------------------------------------------------------
// Filter option sources
// ---------------------------------------------------------------------------

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
  "PR",
];

const VOLTAGE_BANDS: VoltageBand[] = ["extra-high", "high", "medium", "sub-trans", "unknown"];
const SUBSTATION_TYPES: SubstationType[] = ["transmission", "distribution", "hybrid", "unknown"];
const SUBSTATION_STATUSES: SubstationStatus[] = ["in_service", "out_of_service", "planned", "retired", "unknown"];

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "state:asc", label: "State A-Z", value: "state:asc" },
  { id: "maxVoltageKv:desc", label: "Voltage (High to Low)", value: "maxVoltageKv:desc" },
  { id: "maxVoltageKv:asc", label: "Voltage (Low to High)", value: "maxVoltageKv:asc" },
];

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SEARCH_DEBOUNCE_MS } from "@/lib/config/constants";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubstationsPage() {
  const router = useRouter();

  // Filter/sort state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [stateFilter, setStateFilter] = useState("all");
  const [bandFilter, setBandFilter] = useState<"all" | VoltageBand>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | SubstationType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SubstationStatus>("all");
  const [sortValue, setSortValue] = useState("name:asc");

  // Fetch state
  const [rows, setRows] = useState<SubstationApiRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request serialization: ignore stale responses when filters change quickly.
  const requestIdRef = useRef(0);

  const buildQuery = useCallback(
    (opts: { cursor?: string | null } = {}) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (debouncedSearch.trim().length >= 2) params.set("search", debouncedSearch.trim());
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (typeFilter !== "all") params.set("substationType", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const [sortKey, sortDir] = sortValue.split(":");
      params.set("sort", sortKey);
      params.set("order", sortDir);
      if (opts.cursor) params.set("cursor", opts.cursor);
      return params.toString();
    },
    [debouncedSearch, stateFilter, typeFilter, statusFilter, sortValue]
  );

  // Reset + initial fetch whenever filters/sort change
  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const qs = buildQuery();
    fetch(`/api/v1/substations?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as SubstationsApiResponse;
      })
      .then((result) => {
        if (currentRequestId !== requestIdRef.current) return; // stale
        setRows(result.data);
        setCursor(result.pagination.cursor);
        setTotal(result.pagination.total);
        setHasMore(result.pagination.hasMore);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (currentRequestId !== requestIdRef.current) return;
        console.error("Failed to load substations", err);
        setError(err instanceof Error ? err.message : "Failed to load substations");
        setIsLoading(false);
      });
  }, [buildQuery]);

  // Client-side voltage band filter (the API filters by substationType/status
  // but not voltageBand, so we apply this after fetch).
  const visibleRows = useMemo(() => {
    if (bandFilter === "all") return rows;
    return rows.filter((r) => r.voltageBand === bandFilter);
  }, [rows, bandFilter]);

  const tableRows: SubstationRow[] = useMemo(() => visibleRows.map(toRow), [visibleRows]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    const currentRequestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const qs = buildQuery({ cursor });
      const res = await fetch(`/api/v1/substations?${qs}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const result = (await res.json()) as SubstationsApiResponse;
      if (currentRequestId !== requestIdRef.current) return; // filters changed mid-flight
      setRows((prev) => [...prev, ...result.data]);
      setCursor(result.pagination.cursor);
      setHasMore(result.pagination.hasMore);
    } catch (err) {
      console.error("Failed to load more substations", err);
      setError(err instanceof Error ? err.message : "Failed to load more substations");
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, buildQuery]);

  const columns: Column<SubstationRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: SubstationRow) => (
          <Link href={`/substations/${row.slug}`} className="font-medium text-text-body hover:text-brand-primary">
            {row.name}
          </Link>
        ),
      },
      {
        id: "state",
        label: "State",
        accessor: "state",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "ownerName",
        label: "Owner",
        accessor: "ownerName",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "voltageDisplay",
        label: "Voltage",
        accessor: "voltageDisplay",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "voltageBand",
        label: "Class",
        accessor: "voltageBand",
        render: (_value: unknown, row: SubstationRow) => (
          <Badge size="sm" shape="pill" variant={getVoltageBandVariant(row.voltageBand)}>
            {VOLTAGE_BAND_LABELS[row.voltageBand] ?? row.voltageBand}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "substationType",
        label: "Type",
        accessor: "substationType",
        render: (_value: unknown, row: SubstationRow) => (
          <span className="capitalize text-text-body text-sm">
            {SUBSTATION_TYPE_LABELS[row.substationType] ?? row.substationType}
          </span>
        ),
        mobile: false,
      },
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: SubstationRow) => (
          <Badge size="sm" shape="pill" variant={getStatusVariant(row.status)}>
            {STATUS_LABELS[row.status] ?? row.status}
          </Badge>
        ),
        mobile: false,
      },
    ],
    []
  );

  const handleRowClick = useCallback(
    (row: SubstationRow) => {
      router.push(`/substations/${row.slug}`);
    },
    [router]
  );

  const description = total
    ? `${total.toLocaleString()} US electric substations from OpenStreetMap and EIA data — transmission, distribution, switching yards, and more.`
    : "US electric substations from OpenStreetMap and EIA data.";

  const isInitialLoading = isLoading && tableRows.length === 0;

  return (
    <PageLayout>
      <PageLayout.Header title="Substations" description={description} />
      <PageLayout.Content>
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder="Search substations..."
              resultCount={tableRows.length}
              resultLabel="substations"
            />
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-9 rounded-lg border border-border-default bg-background-surface px-3 text-sm text-text-body"
            >
              <option value="all">All States</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value as "all" | VoltageBand)}
              className="h-9 rounded-lg border border-border-default bg-background-surface px-3 text-sm text-text-body"
            >
              <option value="all">All Voltages</option>
              {VOLTAGE_BANDS.map((b) => (
                <option key={b} value={b}>
                  {VOLTAGE_BAND_LABELS[b]}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | SubstationType)}
              className="h-9 rounded-lg border border-border-default bg-background-surface px-3 text-sm text-text-body"
            >
              <option value="all">All Types</option>
              {SUBSTATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SUBSTATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | SubstationStatus)}
              className="h-9 rounded-lg border border-border-default bg-background-surface px-3 text-sm text-text-body"
            >
              <option value="all">All Statuses</option>
              {SUBSTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {/* Results count + sort */}
          <DataControls
            resultsCount={{
              count: tableRows.length,
              label: `of ${total.toLocaleString()} substations`,
            }}
            sort={{
              value: sortValue,
              options: sortOptions,
              onChange: setSortValue,
            }}
          />

          {/* Table / states */}
          {isInitialLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader size={32} />
            </div>
          ) : error ? (
            <EmptyState icon="Lightning" title="Couldn't load substations" description={error} />
          ) : tableRows.length === 0 ? (
            <EmptyState
              icon="Lightning"
              title="No substations match your filters"
              description="Try clearing filters or searching for a different name."
            />
          ) : (
            <>
              <DataTable<SubstationRow> columns={columns} data={tableRows} onRowClick={handleRowClick} />
              {hasMore && (
                <div className="flex items-center justify-center py-6">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="h-9 px-4 rounded-lg border border-border-default bg-background-surface text-sm text-text-body hover:bg-background-subtle disabled:opacity-60"
                  >
                    {isLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
