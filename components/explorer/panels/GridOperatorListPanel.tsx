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
import { useExplorer, type DetailView } from "../ExplorerContext";
import {
  getAllBalancingAuthorities,
  getAllIsos,
  getAllRtos,
  getIsoById,
  searchEntities,
  sortByName,
} from "@/lib/data";

type GridOperatorType = "ISO" | "RTO" | "BA";

interface GridOperatorRow extends Record<string, unknown> {
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  type: GridOperatorType;
  states: string[];
  website: string | null;
  detailView: DetailView;
}

const typeFilterOptions = [
  { id: "all", label: "All Types", value: "all" },
  { id: "ISO", label: "ISO", value: "ISO" },
  { id: "RTO", label: "RTO", value: "RTO" },
  { id: "BA", label: "Balancing Authority", value: "BA" },
];

const typeBadgeVariant: Record<GridOperatorType, "info" | "success" | "warning" | "default"> = {
  ISO: "info",
  RTO: "warning",
  BA: "default",
};

const typeToDetailView: Record<GridOperatorType, DetailView> = {
  ISO: "iso",
  RTO: "rto",
  BA: "ba",
};

export function GridOperatorListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail, navigateToLanding } = useExplorer();

  const allOperators = useMemo(() => {
    const seen = new Set<string>();

    const isos: GridOperatorRow[] = getAllIsos().map((iso) => {
      seen.add(iso.slug);
      return {
        slug: iso.slug,
        name: iso.name,
        shortName: iso.shortName,
        logo: iso.logo,
        type: "ISO" as const,
        states: iso.states,
        website: iso.website,
        detailView: "iso" as const,
      };
    });

    const rtos: GridOperatorRow[] = getAllRtos()
      .filter((rto) => !seen.has(rto.slug))
      .map((rto) => ({
        slug: rto.slug,
        name: rto.name,
        shortName: rto.shortName,
        logo: rto.logo,
        type: "RTO" as const,
        states: rto.states,
        website: rto.website,
        detailView: "rto" as const,
      }));

    const bas: GridOperatorRow[] = getAllBalancingAuthorities().map((ba) => ({
      slug: ba.slug,
      name: ba.name,
      shortName: ba.shortName,
      logo: ba.logo,
      type: "BA" as const,
      states: ba.states,
      website: ba.website,
      detailView: "ba" as const,
    }));

    return [...isos, ...rtos, ...bas];
  }, []);

  const filtered = useMemo(() => {
    let result = allOperators;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.type !== "all") {
      result = result.filter((op) => op.type === state.type);
    }
    result = sortByName(result, "asc");
    return result;
  }, [allOperators, state.q, state.type]);

  const handleRowClick = useCallback(
    (row: GridOperatorRow) => {
      navigateToDetail(row.detailView, row.slug);
    },
    [navigateToDetail]
  );

  const columns: Column<GridOperatorRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: GridOperatorRow) => (
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
        id: "type",
        label: "Type",
        accessor: "type",
        render: (_value: unknown, row: GridOperatorRow) => (
          <Badge size="sm" shape="pill" variant={typeBadgeVariant[row.type]}>
            {row.type}
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
        <h2 className="text-lg font-semibold text-text-heading">Grid Operators</h2>
      </div>
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: filtered.length, label: "grid operators" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search grid operators...",
          }}
          customControls={
            <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
            >
              {typeFilterOptions.map((opt) => (
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
        {filtered.length === 0 ? (
          <EmptyState
            icon="Graph"
            title="No grid operators found"
            description={state.q ? "Try adjusting your search criteria." : "No grid operators in the dataset."}
            fullHeight={true}
          />
        ) : (
          <DataTable
            data={filtered}
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
