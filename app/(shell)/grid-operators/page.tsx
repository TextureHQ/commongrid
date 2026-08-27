"use client";

import {
  Avatar,
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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUtilityList } from "@/hooks/useUtilityList";
import { SEARCH_DEBOUNCE_MS } from "@/lib/config/constants";
import {
  formatCustomerCount,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { UtilitySegmentLabel } from "@/types/entities";

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
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
  { id: "customerCount:desc", label: "Customers (High to Low)", value: "customerCount:desc" },
  { id: "customerCount:asc", label: "Customers (Low to High)", value: "customerCount:asc" },
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

// Common jurisdictions (could be fetched from API if needed)
const JURISDICTIONS = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
  "District of Columbia",
].sort();

function GridOperatorsPageInner() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [sortValue, setSortValue] = useState("customerCount:desc");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");

  // Parse sort
  const [sortField, sortOrder] = sortValue.split(":") as [string, "asc" | "desc"];

  // Build API filters
  const filters = useMemo(() => {
    const f: {
      search?: string;
      segment?: string;
      status?: string;
      jurisdiction?: string;
      sort?: string;
      order?: "asc" | "desc";
      limit: number;
    } = {
      limit: 200,
      sort: sortField,
      order: sortOrder,
    };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (segmentFilter !== "all") f.segment = segmentFilter;
    if (statusFilter !== "all") f.status = statusFilter;
    if (jurisdictionFilter !== "all") f.jurisdiction = jurisdictionFilter;
    return f;
  }, [debouncedSearch, segmentFilter, statusFilter, jurisdictionFilter, sortField, sortOrder]);

  const { utilities, isLoading, error, pagination } = useUtilityList(filters);

  const rows: UtilityRow[] = useMemo(
    () =>
      utilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        status: u.status,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
        website: u.website,
        logo: u.logo,
      })),
    [utilities]
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
            <span className="truncate">{row.name}</span>
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

  const isInitialLoading = isLoading && rows.length === 0;

  if (error) {
    return (
      <PageLayout
        className="flex flex-col h-full overflow-hidden bg-background-default"
        paddingYClass="pt-8 md:pt-12"
        paddingXClass="px-4"
      >
        <div className="flex-none">
          <PageLayout.Header title="Grid Operators" sticky={true} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon="Lightning" title="Failed to load utilities" description={error.message} fullHeight={true} />
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
          <PageLayout.Header title="Grid Operators" sticky={true} />
          <Button
            variant={user ? "primary" : "secondary"}
            size="md"
            isDisabled={!user}
            onPress={() => router.push("/grid-operators/new")}
          >
            <Icon name="Plus" size="sm" />
            <span>Add Utility</span>
          </Button>
        </div>
      </div>
      <div className="flex-none px-1 pb-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search grid operators by name, state, EIA ID..."
          resultCount={showingCount}
          resultLabel="grid operators"
        />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{
            count: showingCount,
            label: hasMore ? `grid operators (${totalCount} total, showing first ${showingCount})` : "grid operators",
          }}
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
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
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
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
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
                className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
              >
                <option value="all">All Jurisdictions</option>
                {JURISDICTIONS.map((j) => (
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
        {isInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader size={32} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No utilities found"
            description={searchQuery ? "Try adjusting your search or filter criteria." : "No utilities in the dataset."}
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
                  Showing first {showingCount} of {totalCount} results. Refine filters to see different utilities.
                </div>
              </div>
            )}
          </>
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
