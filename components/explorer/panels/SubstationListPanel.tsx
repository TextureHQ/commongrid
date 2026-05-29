"use client";

/**
 * SubstationListPanel — Explorer panel for substations.
 *
 * Unlike pricing-nodes or transmission-lines (which preload the full JSON),
 * substations are served from the database via /api/v1/substations with cursor
 * pagination, because the dataset is ~60k+ rows and ~32 MB on disk. This
 * panel mirrors the pattern used by the full /substations page.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useExplorer } from "../ExplorerContext";

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
  "extra-high": "345kV+",
  high: "230–344kV",
  medium: "115–229kV",
  "sub-trans": "69–114kV",
  unknown: "Unknown",
};

const SUBSTATION_TYPE_LABELS: Record<SubstationType, string> = {
  transmission: "Transmission",
  distribution: "Distribution",
  hybrid: "Hybrid",
  unknown: "Unknown",
};

function formatVoltage(row: SubstationApiRow): string {
  const { minVoltageKv, maxVoltageKv } = row;
  if (minVoltageKv != null && maxVoltageKv != null) {
    if (minVoltageKv === maxVoltageKv) return `${maxVoltageKv} kV`;
    return `${minVoltageKv}–${maxVoltageKv} kV`;
  }
  if (maxVoltageKv != null) return `${maxVoltageKv} kV`;
  if (minVoltageKv != null) return `${minVoltageKv} kV`;
  return "—";
}

function getVoltageBandColor(band: VoltageBand): string {
  switch (band) {
    case "extra-high":
      return "var(--color-cg-voltage-extra-high)"; // red
    case "high":
      return "var(--color-cg-voltage-high)"; // orange
    case "medium":
      return "var(--color-cg-voltage-medium)"; // green
    case "sub-trans":
      return "var(--color-cg-voltage-subtrans)"; // light blue
    default:
      return "var(--color-cg-voltage-unknown)"; // gray
  }
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const VOLTAGE_BAND_FILTERS: { id: string; label: string; value: string }[] = [
  { id: "all", label: "All Voltages", value: "all" },
  { id: "extra-high", label: "Extra High (345kV+)", value: "extra-high" },
  { id: "high", label: "High (230–344kV)", value: "high" },
  { id: "medium", label: "Medium (115–229kV)", value: "medium" },
  { id: "sub-trans", label: "Sub-Transmission (69–114kV)", value: "sub-trans" },
  { id: "unknown", label: "Unknown Voltage", value: "unknown" },
];

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    className="cg-explore-arrow"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SubstationListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  // Debounce the search input (state.q updates on each keystroke)
  const debouncedSearch = useDebounced(state.q, 350);

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
      // state.type maps to voltageBand for substations; the API filters maxVoltageKv
      // so we apply voltageBand filter client-side below.
      params.set("sort", "name");
      params.set("order", "asc");
      if (opts.cursor) params.set("cursor", opts.cursor);
      return params.toString();
    },
    [debouncedSearch]
  );

  // Reset + initial fetch whenever search changes
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
        if (currentRequestId !== requestIdRef.current) return;
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

  // Client-side voltage band filter (piggy-backs on state.type filter).
  const bandFilter = state.type && state.type !== "all" ? (state.type as VoltageBand) : null;
  const visibleRows = useMemo(() => {
    if (!bandFilter) return rows;
    return rows.filter((r) => r.voltageBand === bandFilter);
  }, [rows, bandFilter]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    const currentRequestId = requestIdRef.current;
    setIsLoadingMore(true);
    try {
      const qs = buildQuery({ cursor });
      const res = await fetch(`/api/v1/substations?${qs}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const result = (await res.json()) as SubstationsApiResponse;
      if (currentRequestId !== requestIdRef.current) return;
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

  const handleRowClick = useCallback(
    (row: SubstationApiRow) => {
      router.push(`/substations/${row.slug}`);
    },
    [router]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{total.toLocaleString()}</strong> substations
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {VOLTAGE_BAND_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/substations")}>
                Full list →
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <div className="cg-explore-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search substations, owners, states…"
              value={state.q}
              onChange={(e) => setSearch(e.target.value)}
            />
            {state.q && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="cg-explore-loading">Loading substations…</div>
        ) : error ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">Couldn't load substations</div>
            <div>{error}</div>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No substations found</div>
            <div>
              {state.q || bandFilter ? "Try adjusting your search or filters." : "No substations in the dataset."}
            </div>
          </div>
        ) : (
          <>
            {visibleRows.map((row) => (
              <div key={row.id} className="cg-explore-entity-row" onClick={() => handleRowClick(row)}>
                <span
                  className="cg-explore-entity-dot"
                  data-shape="circle"
                  style={{ background: getVoltageBandColor(row.voltageBand) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="cg-explore-entity-name">{row.name}</div>
                  <div className="cg-explore-entity-sub">
                    {row.state} · {SUBSTATION_TYPE_LABELS[row.substationType]} · {formatVoltage(row)}
                    {row.ownerName ? ` · ${row.ownerName}` : ""}
                  </div>
                </div>
                <span
                  className="shrink-0"
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-family-mono)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {VOLTAGE_BAND_LABELS[row.voltageBand]}
                </span>
                <ArrowIcon />
              </div>
            ))}
            {hasMore && (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <button
                  type="button"
                  className="cg-explore-icon-btn"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  style={{ opacity: isLoadingMore ? 0.6 : 1 }}
                >
                  {isLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
