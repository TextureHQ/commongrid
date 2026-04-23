"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePricingNodes } from "@/lib/pricing-nodes";
import { useFuseSearch } from "@/lib/search";
import type { IsoRto, PricingNode, PricingNodeType } from "@/types/pricing-nodes";
import { getIsoColor, getNodeTypeLabel, ISO_LABELS, ISOS } from "@/types/pricing-nodes";
import { useExplorer } from "../ExplorerContext";

interface PricingNodeRow {
  slug: string;
  name: string;
  iso: IsoRto;
  nodeType: PricingNodeType;
  zone: string | null;
  state: string | null;
}

const isoFilterOptions = [
  { id: "all", label: "All ISOs/RTOs", value: "all" },
  ...ISOS.map((iso) => ({ id: iso, label: ISO_LABELS[iso], value: iso })),
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

export function PricingNodeListPanel() {
  const { state, setSearch, setTypeFilter } = useExplorer();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { nodes: allNodes, isLoading } = usePricingNodes();

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "name", weight: 0.4 },
        { name: "iso", weight: 0.2 },
        { name: "zone", weight: 0.2 },
        { name: "state", weight: 0.1 },
        { name: "slug", weight: 0.1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allNodes, state.q, fuseOptions);

  const filtered = useMemo(() => {
    let result: PricingNode[] = searched;
    if (state.type !== "all") {
      result = result.filter((n) => n.iso === state.type);
    }
    if (!state.q.trim()) {
      const typeOrder: Record<string, number> = {
        hub: 0,
        zone: 1,
        lap: 2,
        sublap: 3,
        interface: 4,
        gen: 5,
        load: 6,
        bus: 7,
      };
      result = [...result].sort(
        (a, b) => (typeOrder[a.nodeType] ?? 99) - (typeOrder[b.nodeType] ?? 99) || a.name.localeCompare(b.name)
      );
    }
    return result;
  }, [searched, state.q, state.type]);

  const rows: PricingNodeRow[] = useMemo(
    () =>
      filtered.map((n) => ({
        slug: n.slug,
        name: n.name,
        iso: n.iso,
        nodeType: n.nodeType,
        zone: n.zone,
        state: n.state,
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: PricingNodeRow) => {
      router.push(`/pricing-nodes/${row.slug}`);
    },
    [router]
  );

  if (isLoading) {
    return <div className="cg-explore-loading">Loading pricing nodes…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="cg-explore-panel-header">
        <div className="cg-explore-filter-row" style={{ justifyContent: "space-between" }}>
          <span className="cg-explore-count">
            <strong>{filtered.length.toLocaleString()}</strong> pricing nodes
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select className="cg-explore-select" value={state.type} onChange={(e) => setTypeFilter(e.target.value)}>
              {isoFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {user && (
              <button type="button" className="cg-explore-icon-btn" onClick={() => router.push("/pricing-nodes/new")}>
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
              placeholder="Search nodes, zones, ISOs…"
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
                  color: "var(--cg-muted)",
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
            <div className="cg-explore-empty-title">No pricing nodes found</div>
            <div>
              {state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No pricing nodes in the dataset."}
            </div>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.slug} className="cg-explore-entity-row" onClick={() => handleRowClick(row)}>
              <span
                className="cg-explore-entity-dot"
                data-shape="circle"
                style={{ background: getIsoColor(row.iso) }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cg-explore-entity-name">{row.name}</div>
                <div className="cg-explore-entity-sub">
                  {ISO_LABELS[row.iso]} · {getNodeTypeLabel(row.nodeType)}
                  {row.zone ? ` · ${row.zone}` : ""}
                  {row.state ? ` · ${row.state}` : ""}
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
