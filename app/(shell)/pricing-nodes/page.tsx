"use client";

import {
  Badge,
  type Column,
  DataControls,
  DataTable,
  Loader,
  PageLayout,
  TextCell,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { useCallback, useMemo, useState } from "react";
import { usePricingNodes } from "@/lib/pricing-nodes";
import { useFuseSearch } from "@/lib/search";
import { SearchInput } from "@/components/SearchInput";
import {
  type PricingNode,
  type IsoRto,
  type PricingNodeType,
  ISO_LABELS,
  NODE_TYPE_LABELS,
  getIsoColor,
} from "@/types/pricing-nodes";

interface PricingNodeRow extends Record<string, unknown> {
  slug: string;
  name: string;
  iso: IsoRto;
  nodeType: PricingNodeType;
  zone: string | null;
  state: string | null;
  source: string;
  isoLabel: string;
  nodeTypeLabel: string;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "iso:asc", label: "ISO A-Z", value: "iso:asc" },
  { id: "state:asc", label: "State A-Z", value: "state:asc" },
];

function getNodeTypeBadgeVariant(type: PricingNodeType): "success" | "info" | "warning" | "neutral" {
  switch (type) {
    case "hub": return "warning";
    case "zone": return "info";
    case "sublap": return "info";
    case "lap": return "info";
    case "gen": return "success";
    case "load": return "neutral";
    case "interface": return "neutral";
    default: return "neutral";
  }
}

export default function PricingNodesPage() {
  const router = useRouter();
  const { nodes: allNodes, isLoading } = usePricingNodes();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [isoFilter, setIsoFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  // Unique states for filter
  const states = useMemo(() => {
    const s = new Set(allNodes.map((n) => n.state).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allNodes]);

  // Unique ISOs present in data
  const isos = useMemo(() => {
    const s = new Set(allNodes.map((n) => n.iso));
    return Array.from(s).sort();
  }, [allNodes]);

  // Unique node types present in data
  const nodeTypes = useMemo(() => {
    const s = new Set(allNodes.map((n) => n.nodeType));
    return Array.from(s).sort();
  }, [allNodes]);

  const fuseOptions = useMemo(
    () => ({
      keys: [
        { name: "name", weight: 0.5 },
        { name: "iso", weight: 0.2 },
        { name: "zone", weight: 0.15 },
        { name: "state", weight: 0.1 },
        { name: "nodeType", weight: 0.05 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    }),
    []
  );

  const searched = useFuseSearch(allNodes, searchQuery, fuseOptions);

  const filtered = useMemo(() => {
    let result: PricingNode[] = searched;
    if (isoFilter !== "all") {
      result = result.filter((n) => n.iso === isoFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((n) => n.nodeType === typeFilter);
    }
    if (stateFilter !== "all") {
      result = result.filter((n) => n.state === stateFilter);
    }
    return result;
  }, [searched, isoFilter, typeFilter, stateFilter]);

  const sorted = useMemo(() => {
    const [key, dir] = sortValue.split(":");
    const mod = dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (key) {
        case "name":
          return mod * a.name.localeCompare(b.name);
        case "iso":
          return mod * a.iso.localeCompare(b.iso);
        case "state":
          return mod * (a.state ?? "").localeCompare(b.state ?? "");
        default:
          return 0;
      }
    });
  }, [filtered, sortValue]);

  // Map to row objects with display-friendly labels
  const rows: PricingNodeRow[] = useMemo(
    () =>
      sorted.map((n) => ({
        ...n,
        isoLabel: ISO_LABELS[n.iso] ?? n.iso,
        nodeTypeLabel: NODE_TYPE_LABELS[n.nodeType] ?? n.nodeType,
      })),
    [sorted]
  );

  const columns: Column<PricingNodeRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: PricingNodeRow) => (
          <Link
            href={`/pricing-nodes/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getIsoColor(row.iso) }}
            />
            {row.name}
          </Link>
        ),
      },
      {
        id: "isoLabel",
        label: "ISO/RTO",
        accessor: "isoLabel",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "nodeType",
        label: "Type",
        accessor: "nodeType",
        render: (_value: unknown, row: PricingNodeRow) => (
          <Badge size="sm" shape="pill" variant={getNodeTypeBadgeVariant(row.nodeType)}>
            {NODE_TYPE_LABELS[row.nodeType] ?? row.nodeType}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "zone",
        label: "Zone",
        accessor: "zone",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "state",
        label: "State",
        accessor: "state",
        cell: TextCell,
        mobile: false,
      },
    ],
    []
  );

  const handleRowClick = useCallback(
    (row: PricingNodeRow) => {
      router.push(`/pricing-nodes/${row.slug}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <PageLayout>
        <PageLayout.Header title="Pricing Nodes" />
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header
        title="Pricing Nodes"
        description={`${allNodes.length.toLocaleString()} wholesale electricity market pricing nodes across 7 ISOs/RTOs — trading hubs, load zones, SUBLAPs, and generation nodes.`}
      />
      <DataSourceLink
        paths={["data/pricing-nodes.json"]}
        className="px-4 sm:px-6 pb-2"
      />
      <PageLayout.Content>
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder="Search nodes..."
              resultCount={rows.length}
              resultLabel="pricing nodes"
            />
            <select
              value={isoFilter}
              onChange={(e) => setIsoFilter(e.target.value)}
              className="h-9 rounded-lg border border-border-default bg-background-surface pl-3 pr-7 text-sm text-text-body"
            >
              <option value="all">All ISOs</option>
              {isos.map((iso) => (
                <option key={iso} value={iso}>
                  {ISO_LABELS[iso as IsoRto] ?? iso}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-border-default bg-background-surface pl-3 pr-7 text-sm text-text-body"
            >
              <option value="all">All Types</option>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {NODE_TYPE_LABELS[type as PricingNodeType] ?? type}
                </option>
              ))}
            </select>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-9 rounded-lg border border-border-default bg-background-surface pl-3 pr-7 text-sm text-text-body"
            >
              <option value="all">All States</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Results count + sort */}
          <DataControls
            resultsCount={{ count: rows.length, label: "pricing nodes" }}
            sort={{
              value: sortValue,
              options: sortOptions,
              onChange: setSortValue,
            }}
          />

          {/* Table */}
          <DataTable<PricingNodeRow>
            columns={columns}
            data={rows}
            onRowClick={handleRowClick}
          />
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
