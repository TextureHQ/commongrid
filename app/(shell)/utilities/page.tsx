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
import { useCallback, useMemo, useState } from "react";
import { getAllUtilities, searchEntities, sortByName } from "@/lib/data";
import {
  formatCustomerCount,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { type Utility, UtilitySegment, UtilitySegmentLabel } from "@/types/entities";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  logo: string | null;
  segment: string;
  status: string;
  customerCount: number | null;
  jurisdiction: string | null;
  isoId: string | null;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
];

const segmentFilterOptions = [
  { id: "all", label: "All Segments", value: "all" },
  ...Object.values(UtilitySegment).map((seg) => ({
    id: seg,
    label: UtilitySegmentLabel[seg],
    value: seg,
  })),
];

export default function UtilitiesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [segmentFilter, setSegmentFilter] = useState("all");

  const allUtilities = useMemo(() => getAllUtilities(), []);

  const filtered = useMemo(() => {
    let result: Utility[] = allUtilities;
    if (searchQuery) {
      result = searchEntities(result, searchQuery);
    }
    if (segmentFilter !== "all") {
      result = result.filter((u) => u.segment === segmentFilter);
    }
    const [field, direction] = sortValue.split(":");
    if (field === "name") {
      result = sortByName(result, direction as "asc" | "desc");
    }
    return result;
  }, [allUtilities, searchQuery, segmentFilter, sortValue]);

  const rows: UtilityRow[] = useMemo(
    () =>
      filtered.map((u) => ({
        slug: u.slug,
        name: u.name,
        logo: u.logo,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
        isoId: u.isoId,
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: UtilityRow) => {
      router.push(`/utilities/${row.slug}`);
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
            href={`/utilities/${row.slug}`}
            className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary"
          >
            <Avatar
              {...(row.logo ? { src: row.logo } : {})}
              fullName={row.name}
              size="sm"
              shape="square"
              variant="organization"
            />
            {row.name}
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
      {
        id: "customerCount",
        label: "Customers",
        accessor: "customerCount",
        render: (_value: unknown, row: UtilityRow) => (
          <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>
        ),
        mobile: false,
      },
      {
        id: "jurisdiction",
        label: "Jurisdiction",
        accessor: "jurisdiction",
        cell: TextCell,
        mobile: { priority: 3, format: "secondary" },
      },
    ],
    []
  );

  return (
    <PageLayout className="flex flex-col h-full overflow-hidden" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
      <div className="flex-none">
        <PageLayout.Header title="Utilities" sticky={true} />
        <DataSourceLink paths={["data/utilities.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "utilities" }}
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            onClear: () => setSearchQuery(""),
            placeholder: "Search utilities...",
          }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="h-8 rounded-md border border-border-default bg-background-surface px-2 text-sm text-text-body"
            >
              {segmentFilterOptions.map((opt) => (
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
            title="No utilities found"
            description={searchQuery ? "Try adjusting your search criteria." : "No utilities in the dataset."}
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
