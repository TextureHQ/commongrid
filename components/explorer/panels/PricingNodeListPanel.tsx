"use client";

import {
  Badge,
  Button,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Icon,
  Loader,
  Tooltip,
} from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePricingNodes } from "@/lib/pricing-nodes";
import { useFuseSearch } from "@/lib/search";
import type { IsoRto, PricingNode, PricingNodeType } from "@/types/pricing-nodes";
import { getIsoColor, getNodeTypeLabel, ISO_LABELS, ISOS } from "@/types/pricing-nodes";
import { useExplorer } from "../ExplorerContext";

interface PricingNodeRow extends Record<string, unknown> {
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

function getNodeTypeBadgeVariant(nodeType: PricingNodeType): "info" | "success" | "warning" | "error" | "neutral" {
  switch (nodeType) {
    case "hub":
      return "warning";
    case "zone":
    case "lap":
    case "sublap":
      return "info";
    case "gen":
      return "success";
    case "load":
      return "error";
    case "interface":
      return "neutral";
    default:
      return "neutral";
  }
}

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
    // Sort hubs/zones first, then by name when no search
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

  const columns: Column<PricingNodeRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Node",
        accessor: "name",
        render: (_value: unknown, row: PricingNodeRow) => (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getIsoColor(row.iso) }}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-medium text-text-body truncate">{row.name}</span>
              {row.zone && <span className="text-xs text-text-muted">{row.zone}</span>}
            </div>
          </div>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "iso",
        label: "ISO/RTO",
        accessor: "iso",
        render: (_value: unknown, row: PricingNodeRow) => (
          <Badge size="sm" shape="pill" variant="default">
            {ISO_LABELS[row.iso]}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "nodeType",
        label: "Type",
        accessor: "nodeType",
        render: (_value: unknown, row: PricingNodeRow) => (
          <Badge size="sm" shape="pill" variant={getNodeTypeBadgeVariant(row.nodeType)}>
            {getNodeTypeLabel(row.nodeType)}
          </Badge>
        ),
        mobile: { priority: 3, format: "badge" },
      },
      {
        id: "state",
        label: "State",
        accessor: "state",
        render: (_value: unknown, row: PricingNodeRow) => (
          <span className="text-text-body">{row.state ?? "\u2014"}</span>
        ),
        mobile: false,
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-text-heading">Pricing Nodes</span>
          {user ? (
            <Button variant="primary" size="sm" onPress={() => router.push("/pricing-nodes/new")}>
              <Icon name="Plus" size="sm" />
              <span>Add New</span>
            </Button>
          ) : (
            <Tooltip content="Sign in to add entities">
              <Button variant="secondary" size="sm" isDisabled>
                <Icon name="Plus" size="sm" />
                <span>Add New</span>
              </Button>
            </Tooltip>
          )}
        </div>
        <DataControls
          resultsCount={{ count: filtered.length, label: "pricing nodes" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search nodes, zones, ISOs...",
          }}
          customControls={
            <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
            >
              {isoFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No pricing nodes found"
            description={
              state.q || state.type !== "all"
                ? "Try adjusting your search or filters."
                : "No pricing nodes in the dataset."
            }
            fullHeight={true}
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            mobileBreakpoint="md"
            isLoading={false}
            height="100%"
            stickyHeader={true}
            onRowClick={handleRowClick}
            enableVirtualization={true}
            estimatedRowHeight={56}
          />
        )}
      </div>
    </div>
  );
}
