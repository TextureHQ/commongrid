"use client";

import { Select, TextField } from "@texturehq/edges";
import { PanelEntityRow } from "@texturehq/edges-explore/panel-atoms";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useBalancingAuthorityList } from "@/hooks/useBalancingAuthorityList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsoList } from "@/hooks/useIsoList";
import { useRtoList } from "@/hooks/useRtoList";
import { entityKindColor, isoColor } from "@/lib/categorical-colors";
import { searchEntities, sortByName } from "@/lib/data";
import { formatGridOperatorStates, gridOperatorKey } from "@/lib/explorer/grid-operators";
import { useExplorer } from "../ExplorerContext";

type GridOperatorType = "ISO" | "RTO" | "BA";

interface GridOperatorRow {
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  type: GridOperatorType;
  states: string[];
  website: string | null;
  detailView: "iso" | "rto" | "ba";
  /** `gridOperatorKey(detailView, slug)` — unique across ISO/BA rows that share a slug. */
  key: string;
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

  const { isos: isoList, isLoading: isLoadingIsos } = useIsoList({ limit: 200 });
  const { rtos: rtoList, isLoading: isLoadingRtos } = useRtoList({ limit: 200 });
  const { balancingAuthorities: baList, isLoading: isLoadingBAs } = useBalancingAuthorityList({ limit: 200 });

  const isLoading = isLoadingIsos || isLoadingRtos || isLoadingBAs;

  const allOperators = useMemo(() => {
    const seen = new Set<string>();

    const isos: GridOperatorRow[] = isoList.map((iso) => {
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
        key: gridOperatorKey("iso", iso.slug),
      };
    });

    const rtos: GridOperatorRow[] = rtoList
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
        key: gridOperatorKey("rto", rto.slug),
      }));

    const bas: GridOperatorRow[] = baList.map((ba) => ({
      slug: ba.slug,
      name: ba.name,
      shortName: ba.shortName,
      logo: ba.logo,
      type: "BA" as const,
      states: ba.states,
      website: ba.website,
      detailView: "ba" as const,
      key: gridOperatorKey("ba", ba.slug),
    }));

    return [...isos, ...rtos, ...bas];
  }, [isoList, rtoList, baList]);

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
        {isLoading ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">Loading grid operators…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No grid operators found</div>
            <div>{state.q ? "Try adjusting your search criteria." : "No grid operators in the dataset."}</div>
          </div>
        ) : (
          filtered.map((row) => (
            <PanelEntityRow
              key={row.key}
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
              subtitle={`${row.shortName} · ${row.type} · ${formatGridOperatorStates(row.states)}`}
              onSelect={() => handleRowClick(row)}
            />
          ))
        )}
      </div>
    </div>
  );
}
