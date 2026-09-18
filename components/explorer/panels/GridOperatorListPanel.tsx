"use client";

import { Select, TextField } from "@texturehq/edges";
import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { entityKindColor, isoColor } from "@/lib/categorical-colors";
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
            <Select
              aria-label="Type"
              size="sm"
              selectedKey={state.type}
              onSelectionChange={(key) => setTypeFilter(String(key))}
              items={typeFilterOptions.map((opt) => ({ id: String(opt.value), label: opt.label, value: opt.value }))}
              renderItem={(item) => item.label}
            />
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/grid-operators/new")}>
                + Add
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 14px 7px" }}>
          <TextField
            aria-label="Search grid operators…"
            placeholder="Search grid operators…"
            value={state.q}
            onChange={setSearch}
            showSearchIcon
            isClearable
            onClear={() => setSearch("")}
            reserveErrorSpace={false}
          />
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
            <PanelEntityRow
              key={row.slug}
              leading={
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      row.type === "ISO" || row.type === "RTO" ? isoColor(row.slug) : entityKindColor("grid-operators"),
                  }}
                />
              }
              title={row.name}
              subtitle={`${row.shortName} · ${row.type} · ${row.states.slice(0, 3).join(", ")}${
                row.states.length > 3 ? ` +${row.states.length - 3}` : ""
              }`}
              onSelect={() => handleRowClick(row)}
            />
          ))
        )}
      </div>
    </div>
  );
}
