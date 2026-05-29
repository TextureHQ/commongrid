"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getAllBalancingAuthorities, getAllIsos, getAllRtos, searchEntities, sortByName } from "@/lib/data";
import { type DetailView, useExplorer } from "../ExplorerContext";

type GridOperatorType = "ISO" | "RTO" | "BA";

interface GridOperatorRow {
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  type: GridOperatorType;
  states: string[];
  website: string | null;
  detailView: DetailView;
}

const typeFilterOptions = [
  { id: "all", label: "All Types", value: "all" },
  { id: "ISO", label: "ISO", value: "ISO" },
  { id: "RTO", label: "RTO", value: "RTO" },
  { id: "BA", label: "Balancing Authority", value: "BA" },
];

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

export function GridOperatorListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();

  const allOperators = useMemo(() => {
    const seen = new Set<string>();

    const isos: GridOperatorRow[] = getAllIsos().map((iso) => {
      seen.add(iso.slug);
      return {
        slug: iso.slug,
        name: iso.name,
        shortName: iso.shortName,
        logo: iso.logo,
        type: "ISO" as const,
        states: iso.states,
        website: iso.website,
        detailView: "iso" as const,
      };
    });

    const rtos: GridOperatorRow[] = getAllRtos()
      .filter((rto) => !seen.has(rto.slug))
      .map((rto) => ({
        slug: rto.slug,
        name: rto.name,
        shortName: rto.shortName,
        logo: rto.logo,
        type: "RTO" as const,
        states: rto.states,
        website: rto.website,
        detailView: "rto" as const,
      }));

    const bas: GridOperatorRow[] = getAllBalancingAuthorities().map((ba) => ({
      slug: ba.slug,
      name: ba.name,
      shortName: ba.shortName,
      logo: ba.logo,
      type: "BA" as const,
      states: ba.states,
      website: ba.website,
      detailView: "ba" as const,
    }));

    return [...isos, ...rtos, ...bas];
  }, []);

  const filtered = useMemo(() => {
    let result = allOperators;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.type !== "all") {
      result = result.filter((op) => op.type === state.type);
    }
    result = sortByName(result, "asc");
    return result;
  }, [allOperators, state.q, state.type]);

  const handleRowClick = useCallback(
    (row: GridOperatorRow) => {
      navigateToDetail(row.detailView, row.slug);
    },
    [navigateToDetail]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length}</strong> grid operators
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {typeFilterOptions.map((opt) => (
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
              placeholder="Search grid operators…"
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
        {filtered.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No grid operators found</div>
            <div>{state.q ? "Try adjusting your search criteria." : "No grid operators in the dataset."}</div>
          </div>
        ) : (
          filtered.map((row) => (
            <div key={row.slug} className="cg-explore-entity-row" onClick={() => handleRowClick(row)}>
              <span className="cg-explore-entity-dot" data-shape="square" style={{ background: "var(--cg-blue)" }} />
              <div className="flex-1 min-w-0">
                <div className="cg-explore-entity-name">{row.name}</div>
                <div className="cg-explore-entity-sub">
                  {row.shortName} · {row.type} · {row.states.slice(0, 3).join(", ")}
                  {row.states.length > 3 ? ` +${row.states.length - 3}` : ""}
                </div>
              </div>
              <ArrowIcon />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
