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
  PageLayout,
  TextCell,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePricingNodeList } from "@/hooks/usePricingNodeList";
import { getIsoColor, ISO_LABELS, type IsoRto, NODE_TYPE_LABELS, type PricingNodeType } from "@/types/pricing-nodes";

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
];

const isoFilterOptions = [
  { id: "all", label: "All ISOs", value: "all" },
  { id: "caiso", label: "CAISO", value: "caiso" },
  { id: "ercot", label: "ERCOT", value: "ercot" },
  { id: "isone", label: "ISO-NE", value: "isone" },
  { id: "miso", label: "MISO", value: "miso" },
  { id: "nyiso", label: "NYISO", value: "nyiso" },
  { id: "pjm", label: "PJM", value: "pjm" },
  { id: "spp", label: "SPP", value: "spp" },
];

const nodeTypeFilterOptions = [
  { id: "all", label: "All Types", value: "all" },
  { id: "hub", label: "Hub", value: "hub" },
  { id: "zone", label: "Zone", value: "zone" },
  { id: "gen", label: "Generator", value: "gen" },
  { id: "load", label: "Load", value: "load" },
  { id: "interface", label: "Interface", value: "interface" },
  { id: "sublap", label: "Sub-LAP", value: "sublap" },
  { id: "lap", label: "LAP", value: "lap" },
];

function getNodeTypeBadgeVariant(type: PricingNodeType): "success" | "info" | "warning" | "neutral" {
  switch (type) {
    case "hub":
      return "warning";
    case "zone":
      return "info";
    case "sublap":
      return "info";
    case "lap":
      return "info";
    case "gen":
      return "success";
    case "load":
      return "neutral";
    case "interface":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function PricingNodesPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [isoFilter, setIsoFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Parse sort
  const [sortField, sortOrder] = sortValue.split(":") as [string, "asc" | "desc"];

  // Build API filters
  const filters = useMemo(() => {
    const f: {
      search?: string;
      iso?: string;
      nodeType?: string;
      sort?: string;
      order?: "asc" | "desc";
      limit: number;
    } = {
      limit: 200,
      sort: sortField,
      order: sortOrder,
    };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (isoFilter !== "all") f.iso = isoFilter;
    if (typeFilter !== "all") f.nodeType = typeFilter;
    return f;
  }, [debouncedSearch, isoFilter, typeFilter, sortField, sortOrder]);

  const { pricingNodes, isLoading, error, pagination } = usePricingNodeList(filters);

  // Map to row objects with display-friendly labels
  const rows: PricingNodeRow[] = useMemo(
    () =>
      pricingNodes.map((n) => ({
        ...n,
        isoLabel: ISO_LABELS[n.iso] ?? n.iso,
        nodeTypeLabel: NODE_TYPE_LABELS[n.nodeType] ?? n.nodeType,
      })),
    [pricingNodes]
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
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "isoLabel",
        label: "ISO/RTO",
        accessor: "isoLabel",
        cell: TextCell,
        mobile: { priority: 2, format: "secondary" },
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

  if (isLoading && rows.length === 0) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Pricing Nodes" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Pricing Nodes" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="Lightning"
            title="Failed to load pricing nodes"
            description={error.message}
            fullHeight={true}
          />
        </div>
      </PageLayout>
    );
  }

  const totalCount = pagination?.totalCount ?? rows.length;
  const showingCount = rows.length;
  const hasMore = pagination?.hasNextPage ?? false;

  return (
    <PageLayout
      className="flex flex-col h-full overflow-hidden bg-background-default"
      paddingYClass="pt-8 md:pt-12"
      paddingXClass="px-4"
    >
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <PageLayout.Header title="Pricing Nodes" sticky={true} />
          <Button
            variant={user ? "primary" : "secondary"}
            size="md"
            isDisabled={!user}
            onPress={() => router.push("/pricing-nodes/new")}
          >
            <Icon name="Plus" size="sm" />
            <span>Add Pricing Node</span>
          </Button>
        </div>
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search nodes..."
          resultCount={showingCount}
          resultLabel="pricing nodes"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{
            count: showingCount,
            label: hasMore ? `pricing nodes (${totalCount} total, showing first ${showingCount})` : "pricing nodes",
          }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={isoFilter}
                onChange={(e) => setIsoFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                {isoFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                {nodeTypeFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
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
              searchQuery ? "Try adjusting your search or filter criteria." : "No pricing nodes in the dataset."
            }
            fullHeight={true}
          />
        ) : (
          <>
            <DataTable
              className="border-r border-l"
              data={rows}
              columns={columns}
              mobileBreakpoint="md"
              isLoading={isLoading}
              height="100%"
              stickyHeader={true}
              onRowClick={handleRowClick}
            />
            {hasMore && (
              <div className="flex justify-center py-4 border-t border-border-default">
                <div className="text-sm text-text-secondary">
                  Showing first {showingCount} of {totalCount} results. Refine filters to see different nodes.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
