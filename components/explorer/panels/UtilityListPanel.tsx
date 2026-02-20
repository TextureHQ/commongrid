"use client";

import {
  Avatar,
  Badge,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
} from "@texturehq/edges";
import { useCallback, useMemo } from "react";
import { useExplorer } from "../ExplorerContext";
import { getAllUtilities, searchEntities, sortByName } from "@/lib/data";
import {
  getSegmentBadgeVariant,
  getSegmentLabel,
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

export function UtilityListPanel() {
  const { state, setSearch, setSegment, navigateToDetail, navigateToLanding } = useExplorer();

  const allUtilities = useMemo(() => getAllUtilities(), []);

  const filtered = useMemo(() => {
    let result: Utility[] = allUtilities;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.segment !== "all") {
      result = result.filter((u) => u.segment === state.segment);
    }
    result = sortByName(result, "asc");
    return result;
  }, [allUtilities, state.q, state.segment]);

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
      })),
    [filtered]
  );

  const handleRowClick = useCallback(
    (row: UtilityRow) => {
      navigateToDetail("utility", row.slug);
    },
    [navigateToDetail]
  );

  const columns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <span className="flex items-center gap-2 font-medium text-text-body">
            <Avatar
              {...(row.logo ? { src: row.logo } : {})}
              fullName={row.name}
              size="sm"
              shape="square"
              variant="organization"
            />
            {row.name}
          </span>
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
    ],
    []
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={navigateToLanding}
          className="text-sm text-text-muted hover:text-text-body transition-colors mb-2"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-text-heading">Utilities</h2>
      </div>
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: filtered.length, label: "utilities" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search utilities...",
          }}
          sort={{
            value: "name:asc",
            options: sortOptions,
            onChange: () => {},
          }}
          customControls={
            <select
              value={state.segment}
              onChange={(e) => setSegment(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
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
            description={state.q ? "Try adjusting your search criteria." : "No utilities in the dataset."}
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
          />
        )}
      </div>
    </div>
  );
}
