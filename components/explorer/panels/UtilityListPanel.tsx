"use client";

import { type FacetConfig, type FilterState, getFilterFields } from "@texturehq/edges";
import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { utilityColor } from "@/lib/categorical-colors";
import { getSegmentLabel } from "@/lib/formatting";
import { type Utility, UtilitySegment, UtilitySegmentLabel } from "@/types/entities";
import { useExplorer } from "../ExplorerContext";

interface UtilityRow {
  slug: string;
  name: string;
  logo: string | null;
  segment: string;
  status: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

interface PaginationMeta {
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
];

// ── Segment filter options (shown as inline buttons) ────────────────────────

const SEGMENT_OPTIONS = [
  { value: "DISTRIBUTION_COOPERATIVE", label: "Distribution Co-op" },
  { value: "GENERATION_AND_TRANSMISSION", label: "G&T Co-op" },
  { value: "INVESTOR_OWNED_UTILITY", label: "Investor-Owned" },
  { value: "MUNICIPAL_UTILITY", label: "Municipal" },
  { value: "COMMUNITY_CHOICE_AGGREGATOR", label: "CCA" },
  { value: "POLITICAL_SUBDIVISION", label: "Political Sub." },
  { value: "TRANSMISSION_OPERATOR", label: "Transmission Op." },
  { value: "JOINT_ACTION_AGENCY", label: "Joint Action" },
  { value: "FEDERAL", label: "Federal" },
] as const;

// ── API helpers ─────────────────────────────────────────────────────────────

function buildApiParams(
  q: string,
  segment: string,
  jurisdictions: string[],
  sortValue: string,
  limit: number,
  cursor?: string | null
): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (segment !== "all") params.set("segment", segment);
  if (jurisdictions.length > 0) params.set("state", jurisdictions[0]);
  const [sortField, sortOrder] = sortValue.split(":");
  params.set("sort", sortField ?? "name");
  params.set("order", sortOrder ?? "asc");
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return params;
}

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 3H2l8 9.46V19l4 2V12.46z" />
  </svg>
);

export function UtilityListPanel() {
  const { state, setSearch, setSegment, setJurisdictions, navigateToDetail } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const [sortValue, setSortValue] = useState("name:asc");

  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, nextCursor: null, hasMore: false, limit: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState(state.q);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(state.q);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [state.q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = buildApiParams(debouncedSearch, state.segment, state.jurisdictions, sortValue, 50);

    setIsLoading(true);
    fetch(`/api/v1/utilities?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setUtilities(data.data ?? []);
        setMeta({
          total: data.pagination?.total ?? 0,
          nextCursor: data.pagination?.cursor ?? null,
          hasMore: data.pagination?.hasMore ?? false,
          limit: data.pagination?.limit ?? 50,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, state.segment, state.jurisdictions, sortValue]);

  const loadMore = useCallback(async () => {
    if (!meta.nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    const params = buildApiParams(debouncedSearch, state.segment, state.jurisdictions, sortValue, 50, meta.nextCursor);

    const res = await fetch(`/api/v1/utilities?${params.toString()}`);
    const data = await res.json();

    setUtilities((prev) => [...prev, ...(data.data ?? [])]);
    setMeta({
      total: data.pagination?.total ?? 0,
      nextCursor: data.pagination?.cursor ?? null,
      hasMore: data.pagination?.hasMore ?? false,
      limit: data.pagination?.limit ?? 50,
    });
    setIsLoadingMore(false);
  }, [meta.nextCursor, isLoadingMore, debouncedSearch, state.segment, state.jurisdictions, sortValue]);

  const rows: UtilityRow[] = useMemo(
    () =>
      utilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        logo: u.logo,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [utilities]
  );

  const activeFilterCount = state.segment !== "all" ? 1 : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((skeletonKey) => (
            <PanelEntityRow key={skeletonKey} loading leadingShape="dot" title="" onSelect={() => {}} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header with search and controls */}
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{meta.total.toLocaleString()}</strong> utilities
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={sortValue} onChange={(e) => setSortValue(e.target.value)}>
              {sortOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/grid-operators/new")}>
                + Add
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <div className="cg-explore-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search utilities…"
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

        {/* Inline segment filter buttons */}
        <div style={{ padding: "4px 12px 8px", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SEGMENT_OPTIONS.map((opt) => {
            const isActive = state.segment === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSegment(isActive ? "all" : opt.value)}
                style={{
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  border: `1px solid ${isActive ? "var(--color-action-brand)" : "var(--color-border-muted)"}`,
                  background: isActive ? "var(--color-action-brand)/0.08" : "transparent",
                  color: isActive ? "var(--color-action-brand)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entity list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No utilities found</div>
            <div>
              {state.q || activeFilterCount > 0
                ? "Try adjusting your search or filters."
                : "No utilities match the selected filters."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <PanelEntityRow
              key={row.slug}
              leading={<span className="h-2 w-2 rounded-full" style={{ background: utilityColor(row.segment) }} />}
              title={row.name}
              subtitle={`${row.jurisdiction ?? "—"} · ${getSegmentLabel(row.segment)}`}
              onSelect={() => navigateToDetail("utility", row.slug)}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {meta.hasMore && (
        <div className="cg-explore-pagination">
          <span className="cg-explore-pagination-info">
            Showing <b>{utilities.length.toLocaleString()}</b> of <b>{meta.total.toLocaleString()}</b>
          </span>
          <button
            type="button"
            className="cg-explore-page-btn"
            style={{ width: "auto", padding: "0 12px" }}
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
