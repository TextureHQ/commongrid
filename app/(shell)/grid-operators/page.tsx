"use client";

import {
  Avatar,
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  PageLayout,
  TextCell,
} from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAllUtilities, sortByName } from "@/lib/data";
import { useFuseSearch } from "@/lib/search";
import { SearchInput } from "@/components/SearchInput";
import {
  formatCustomerCount,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";
import type { Utility } from "@/types/entities";
import { UtilitySegment, UtilitySegmentLabel } from "@/types/entities";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  status: string;
  customerCount: number | null;
  jurisdiction: string | null;
  website: string | null;
  logo: string | null;
}

const sortOptions = [
  { id: "name:asc", label: "Name ▲", value: "name:asc" },
  { id: "name:desc", label: "Name ▼", value: "name:desc" },
  { id: "customers:desc", label: "Customers ▼", value: "customers:desc" },
  { id: "customers:asc", label: "Customers ▲", value: "customers:asc" },
];

const segmentFilterOptions = [
  { id: "all", label: "All Segments", value: "all" },
  ...Object.entries(UtilitySegmentLabel).map(([key, label]) => ({
    id: key,
    label,
    value: key,
  })),
];

const statusFilterOptions = [
  { id: "all", label: "All Statuses", value: "all" },
  { id: "ACTIVE", label: "Active", value: "ACTIVE" },
  { id: "MERGED", label: "Merged", value: "MERGED" },
  { id: "ACQUIRED", label: "Acquired", value: "ACQUIRED" },
  { id: "DEFUNCT", label: "Defunct", value: "DEFUNCT" },
];

const FUSE_OPTIONS = {
  keys: [
    { name: "name", weight: 0.4 },
    { name: "shortName", weight: 0.2 },
    { name: "eiaName", weight: 0.15 },
    { name: "slug", weight: 0.1 },
    { name: "jurisdiction", weight: 0.1 },
    { name: "eiaId", weight: 0.05 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
};

function GridOperatorsPageInner() {
  const router = useRouter();
  const allUtilities = useMemo(() => getAllUtilities(), []);
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [sortValue, setSortValue] = useState("customers:desc");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");

  // Get unique jurisdictions for filter
  const jurisdictions = useMemo(() => {
    const j = new Set(allUtilities.map((u) => u.jurisdiction).filter(Boolean) as string[]);
    return Array.from(j).sort();
  }, [allUtilities]);

  // Fuse.js search
  const searched = useFuseSearch(allUtilities, searchQuery, FUSE_OPTIONS);

  // Apply filters + sort
  const filtered = useMemo(() => {
    let result = searched;
    if (segmentFilter !== "all") {
      result = result.filter((u) => u.segment === segmentFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((u) => u.status === statusFilter);
    }
    if (jurisdictionFilter !== "all") {
      result = result.filter((u) => u.jurisdiction === jurisdictionFilter);
    }
    // Sort (skip if Fuse search is active — it returns relevance-ordered)
    if (!searchQuery.trim()) {
      const [field, direction] = sortValue.split(":");
      if (field === "name") {
        result = sortByName(result, direction as "asc" | "desc");
      } else if (field === "customers") {
        result = [...result].sort((a, b) => {
          const ca = a.customerCount ?? 0;
          const cb = b.customerCount ?? 0;
          return direction === "desc" ? cb - ca : ca - cb;
        });
      }
    }
    return result;
  }, [searched, segmentFilter, statusFilter, jurisdictionFilter, sortValue, searchQuery]);

  const rows: UtilityRow[] = useMemo(
    () =>
      filtered.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
        website: u.website,
        logo: u.logo,
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: UtilityRow) => {
      router.push(`/grid-operators/${row.slug}`);
    },
    [router]
  );

  const columns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <Link
            href={`/grid-operators/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <Avatar
              {...(row.logo ? { src: row.logo } : {})}
              fullName={row.name}
              size="sm"
              shape="square"
              variant="organization"
            />
            <span className="line-clamp-2 sm:line-clamp-1 hyphens-auto">{row.name}</span>
          </Link>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "segment",
        label: "Segment",
        accessor: "segment",
        render: (_value: unknown, row: UtilityRow) => (
          <Badge size="sm" shape="pill" variant={getSegmentBadgeVariant(row.segment)}>
            {getSegmentLabel(row.segment)}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "customerCount",
        label: "Customers",
        accessor: "customerCount",
        render: (_value: unknown, row: UtilityRow) => (
          <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>
        ),
        mobile: { priority: 3, format: "secondary" },
      },
      {
        id: "jurisdiction",
        label: "Jurisdiction",
        accessor: "jurisdiction",
        cell: TextCell,
        mobile: false,
      },
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: UtilityRow) => (
          <Badge size="sm" shape="pill" variant={getStatusBadgeVariant(row.status)}>
            {getStatusLabel(row.status)}
          </Badge>
        ),
        mobile: false,
      },
    ],
    []
  );

  return (
    <PageLayout className="flex flex-col h-full overflow-hidden bg-background-default" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
      <div className="flex-none">
        <PageLayout.Header title="Grid Operators" sticky={true} />
        <DataSourceLink paths={["data/utilities.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search grid operators by name, state, EIA ID..."
          resultCount={filtered.length}
          resultLabel="grid operators"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "grid operators" }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <div className="flex flex-wrap gap-2">
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                {segmentFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={jurisdictionFilter}
                onChange={(e) => setJurisdictionFilter(e.target.value)}
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface pl-2 pr-7 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Jurisdictions</option>
                {jurisdictions.map((j) => (
                  <option key={j} value={j}>
                    {j}
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
            title="No utilities found"
            description={searchQuery ? "Try adjusting your search or filter criteria." : "No utilities in the dataset."}
            fullHeight={true}
          />
        ) : (
          <DataTable
            className="border-r border-l"
            data={rows}
            columns={columns}
            mobileBreakpoint="md"
            isLoading={false}
            height="100%"
            stickyHeader={true}
            onRowClick={handleRowClick}
          />
        )}
      </div>
    </PageLayout>
  );
}

export default function GridOperatorsPage() {
  return (
    <Suspense>
      <GridOperatorsPageInner />
    </Suspense>
  );
}
