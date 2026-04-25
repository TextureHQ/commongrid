"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFuseSearch } from "@/lib/search";
import { useTransmissionLines } from "@/lib/transmission-lines";
import {
  type TransmissionLine,
  VOLTAGE_CLASSES,
  type VoltageClass,
  VoltageClassLabel,
} from "@/types/transmission-lines";
import { useExplorer } from "../ExplorerContext";

interface TransmissionLineRow {
  objectId: number;
  id: string;
  owner: string;
  voltage: number | null;
  voltageClass: VoltageClass;
  status: string;
  lengthMiles: number;
  sub1: string;
  sub2: string;
}

const voltageClassFilterOptions = [
  { id: "all", label: "All Voltage Classes", value: "all" },
  ...VOLTAGE_CLASSES.map((vc) => ({
    id: vc,
    label: VoltageClassLabel[vc],
    value: vc,
  })),
];

function getVoltageShortLabel(vc: VoltageClass): string {
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

export function TransmissionListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { lines: allLines, isLoading } = useTransmissionLines();

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "owner", weight: 0.5 },
        { name: "id", weight: 0.2 },
        { name: "sub1", weight: 0.15 },
        { name: "sub2", weight: 0.15 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allLines, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: TransmissionLine[] = searched;
    if (state.type !== "all") {
      result = result.filter((l) => l.voltageClass === state.type);
    }
    if (!state.q.trim()) {
      result = [...result].sort((a, b) => (b.voltage ?? -1) - (a.voltage ?? -1));
    }
    return result;
  }, [searched, state.q, state.type]);

  const rows: TransmissionLineRow[] = useMemo(
    () =>
      filtered.map((l) => ({
        objectId: l.objectId,
        id: l.id,
        owner: l.owner,
        voltage: l.voltage,
        voltageClass: l.voltageClass,
        status: l.status,
        lengthMiles: l.lengthMiles,
        sub1: l.sub1,
        sub2: l.sub2,
      })),
    [filtered]
  );

  if (isLoading) {
    return <div className="cg-explore-loading">Loading transmission lines…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length.toLocaleString()}</strong> lines
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {voltageClassFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button
                type="button"
                className="cg-explore-icon-btn"
                onClick={() => router.push("/transmission-lines/new")}
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
              placeholder="Search by owner, ID, substation…"
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
            <div className="cg-explore-empty-title">No transmission lines found</div>
            <div>
              {state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No transmission lines in the dataset."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.objectId} className="cg-explore-entity-row">
              <span
                className="cg-explore-entity-dot"
                data-shape="line"
                style={{ background: "var(--color-text-muted)", width: 8, height: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cg-explore-entity-name">{row.owner || "Unknown owner"}</div>
                <div className="cg-explore-entity-sub">
                  {row.sub1} → {row.sub2} · {getVoltageShortLabel(row.voltageClass)}
                  {row.voltage != null && row.voltage > 0 ? ` (${row.voltage} kV)` : ""}
                </div>
              </div>
              <span
                style={{ fontSize: 11, fontFamily: "var(--font-family-mono)", color: "var(--color-text-muted)", flexShrink: 0 }}
              >
                {row.lengthMiles > 0 ? `${row.lengthMiles.toFixed(1)} mi` : "—"}
              </span>
              <ArrowIcon />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
