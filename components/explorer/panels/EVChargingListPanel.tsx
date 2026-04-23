"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEvCharging } from "@/lib/ev-charging";
import { useFuseSearch } from "@/lib/search";
import type { EVStation } from "@/types/ev-charging";
import { EV_NETWORKS, getNetworkColor, getNetworkShortName, getStatusLabel } from "@/types/ev-charging";
import { useExplorer } from "../ExplorerContext";

interface EVStationRow {
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

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="cg-explore-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

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

  if (isLoading) {
    return <div className="cg-explore-loading">Loading EV charging stations…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length.toLocaleString()}</strong> stations
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              className="cg-explore-select"
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {networkFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button
                type="button"
                className="cg-explore-icon-btn"
                onClick={() => router.push("/ev-charging/new")}
              >
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
              placeholder="Search stations, cities, networks…"
              value={state.q}
              onChange={(e) => setSearch(e.target.value)}
            />
            {state.q && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cg-muted)", fontSize: 14, padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No EV charging stations found</div>
            <div>
              {state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No EV charging stations in the dataset."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.slug}
              className="cg-explore-entity-row"
              onClick={() => handleRowClick(row)}
            >
              <span
                className="cg-explore-entity-dot"
                data-shape="circle"
                style={{ background: getNetworkColor(row.evNetwork) }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cg-explore-entity-name">{row.stationName}</div>
                <div className="cg-explore-entity-sub">
                  {row.city}, {row.state} · {getNetworkShortName(row.evNetwork)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                {row.evDcFastNum > 0 && (
                  <span style={{ fontSize: 11, fontFamily: "var(--cg-font-mono)", color: "var(--cg-ink)" }}>
                    {row.evDcFastNum} DC Fast
                  </span>
                )}
                {row.evLevel2EvseNum > 0 && (
                  <span style={{ fontSize: 10.5, fontFamily: "var(--cg-font-mono)", color: "var(--cg-muted)" }}>
                    {row.evLevel2EvseNum} L2
                  </span>
                )}
              </div>
              <ArrowIcon />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
