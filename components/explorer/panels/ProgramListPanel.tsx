"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getAllPrograms, searchEntities, sortByName } from "@/lib/data";
import { useUtilities } from "@/lib/utilities-client";
import { AssetTypeLabel, CompensationTypeLabel, CompensationUnitLabel, type Program } from "@/types/programs";
import { useExplorer } from "../ExplorerContext";

const assetTypeFilterOptions = [
  { id: "all", label: "All Asset Types", value: "all" },
  { id: "BATTERY", label: "Battery Storage", value: "BATTERY" },
  { id: "THERMOSTAT", label: "Smart Thermostat", value: "THERMOSTAT" },
  { id: "EV_CHARGER", label: "EV Charger", value: "EV_CHARGER" },
  { id: "WATER_HEATER", label: "Water Heater", value: "WATER_HEATER" },
  { id: "HVAC", label: "HVAC", value: "HVAC" },
  { id: "SOLAR_PV", label: "Solar PV", value: "SOLAR_PV" },
  { id: "POOL_PUMP", label: "Pool Pump", value: "POOL_PUMP" },
  { id: "GENERATOR", label: "Generator", value: "GENERATOR" },
];

interface ProgramRow {
  slug: string;
  name: string;
  utilityName: string;
  utilitySlug: string | null;
  assetTypes: string[];
  status: string;
  compensationSummary: string;
}

function getPrimaryCompensationSummary(program: Program): string {
  if (!program.compensationTiers || program.compensationTiers.length === 0) return "";
  const tier = program.compensationTiers[0];
  const typeLabel = CompensationTypeLabel[tier.type] ?? tier.type;
  const unitLabel = CompensationUnitLabel[tier.unit] ?? tier.unit;
  return `$${tier.amount} ${typeLabel.toLowerCase()} ${unitLabel}`;
}

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

export function ProgramListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail, setFilteredUtilitySlugs } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { utilities } = useUtilities();

  const allPrograms = useMemo((): ProgramRow[] => {
    const programs = getAllPrograms();
    return programs.map((prog) => {
      const adminOrg = prog.organizations.find((o) => o.role === "ADMINISTRATOR");
      const utility = adminOrg ? utilities.find((u) => u.slug === adminOrg.entityId) : null;
      return {
        slug: prog.slug,
        name: prog.name,
        utilityName: utility?.name ?? adminOrg?.entityId ?? "—",
        utilitySlug: adminOrg?.entityId ?? null,
        assetTypes: prog.assetTypes,
        status: prog.status,
        compensationSummary: getPrimaryCompensationSummary(prog),
      };
    });
  }, [utilities]);

  const filtered = useMemo(() => {
    let result = allPrograms;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.type !== "all") {
      result = result.filter((p) => p.assetTypes.includes(state.type));
    }
    result = sortByName(result, "asc");
    return result;
  }, [allPrograms, state.q, state.type]);

  // Push filtered utility slugs to context for map filtering
  useEffect(() => {
    const hasFilter = state.q !== "" || state.type !== "all";
    if (!hasFilter) {
      setFilteredUtilitySlugs(null);
      return;
    }
    const slugs = [...new Set(filtered.map((p) => p.utilitySlug).filter((s): s is string => s !== null))];
    setFilteredUtilitySlugs(slugs);
  }, [filtered, state.q, state.type, setFilteredUtilitySlugs]);

  // Clear filtered slugs on unmount (e.g. switching away from programs)
  useEffect(() => {
    return () => setFilteredUtilitySlugs(null);
  }, [setFilteredUtilitySlugs]);

  const handleRowClick = useCallback(
    (row: ProgramRow) => {
      navigateToDetail("program", row.slug);
    },
    [navigateToDetail]
  );

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? "Active" : s === "PAUSED" ? "Paused" : s === "FULL" ? "Full" : s;
  const statusColor = (s: string) =>
    s === "ACTIVE" ? "var(--cg-lime)" : s === "PAUSED" ? "var(--cg-amber)" : "var(--color-text-muted)";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length}</strong> programs
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {assetTypeFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/programs/new")}>
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
              placeholder="Search programs…"
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
            <div className="cg-explore-empty-title">No programs found</div>
            <div>{state.q ? "Try adjusting your search criteria." : "No programs in the dataset."}</div>
          </div>
        ) : (
          filtered.map((row) => (
            <div key={row.slug} className="cg-explore-entity-row" onClick={() => handleRowClick(row)}>
              <span className="cg-explore-entity-dot" data-shape="square" style={{ background: "var(--cg-purple)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cg-explore-entity-name">{row.name}</div>
                <div className="cg-explore-entity-sub">
                  {row.utilityName} ·{" "}
                  {row.assetTypes.map((at) => AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at).join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)", color: statusColor(row.status) }}>
                  {statusLabel(row.status)}
                </span>
                {row.compensationSummary && (
                  <span style={{ fontSize: 11, fontFamily: "var(--font-family-mono)", color: "var(--color-text-muted)" }}>
                    {row.compensationSummary}
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
