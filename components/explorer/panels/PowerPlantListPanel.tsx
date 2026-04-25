"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatCapacity, getFuelCategoryColor, getFuelCategoryLabel } from "@/lib/formatting";
import { usePowerPlants } from "@/lib/power-plants";
import { useFuseSearch } from "@/lib/search";
import { FUEL_CATEGORIES, FuelCategoryLabel, type PowerPlant } from "@/types/entities";
import { useExplorer } from "../ExplorerContext";

interface PowerPlantRow {
  slug: string;
  name: string;
  fuelCategory: string;
  totalCapacityMw: number;
  state: string;
  utilityName: string;
  status: string;
  proposedCapacityMw: number | null;
}

const fuelFilterOptions = [
  { id: "all", label: "All Fuel Types", value: "all" },
  ...FUEL_CATEGORIES.map((cat) => ({
    id: cat,
    label: FuelCategoryLabel[cat],
    value: cat,
  })),
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

export function PowerPlantListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { plants: allPlants, isLoading } = usePowerPlants();

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "name", weight: 0.4 },
        { name: "utilityName", weight: 0.25 },
        { name: "slug", weight: 0.1 },
        { name: "state", weight: 0.15 },
        { name: "county", weight: 0.1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allPlants, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: PowerPlant[] = searched;
    if (state.type !== "all") {
      result = result.filter((p) => p.fuelCategory === state.type);
    }
    if (!state.q.trim()) {
      result = [...result].sort((a, b) => {
        const capA = a.status === "operable" ? a.totalCapacityMw : (a.proposedCapacityMw ?? 0);
        const capB = b.status === "operable" ? b.totalCapacityMw : (b.proposedCapacityMw ?? 0);
        return capB - capA;
      });
    }
    return result;
  }, [searched, state.q, state.type]);

  const rows: PowerPlantRow[] = useMemo(
    () =>
      filtered.map((p) => ({
        slug: p.slug,
        name: p.name,
        fuelCategory: p.fuelCategory,
        totalCapacityMw: p.totalCapacityMw,
        state: p.state,
        utilityName: p.utilityName,
        status: p.status,
        proposedCapacityMw: p.proposedCapacityMw,
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: PowerPlantRow) => {
      router.push(`/power-plants/${row.slug}`);
    },
    [router]
  );

  if (isLoading) {
    return <div className="cg-explore-loading">Loading power plants…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length.toLocaleString()}</strong> power plants
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {fuelFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/power-plants/new")}>
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
              placeholder="Search plants, utilities, states…"
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
        {rows.length === 0 ? (
          <div className="cg-explore-empty">
            <div className="cg-explore-empty-title">No power plants found</div>
            <div>
              {state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No power plants in the dataset."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.slug} className="cg-explore-entity-row" onClick={() => handleRowClick(row)}>
              <span
                className="cg-explore-entity-dot"
                data-shape="circle"
                style={{ background: getFuelCategoryColor(row.fuelCategory) }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cg-explore-entity-name">{row.name}</div>
                <div className="cg-explore-entity-sub">
                  {row.state} · {getFuelCategoryLabel(row.fuelCategory)} ·{" "}
                  {row.status === "operable"
                    ? formatCapacity(row.totalCapacityMw)
                    : formatCapacity(row.proposedCapacityMw)}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "var(--cg-teal)", fontFamily: "var(--cg-font-mono)", flexShrink: 0 }}>
                {row.utilityName}
              </span>
              <ArrowIcon />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
