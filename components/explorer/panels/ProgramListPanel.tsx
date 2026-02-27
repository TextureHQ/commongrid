"use client";

import { Badge, DataControls, DataTable, EmptyState, type Column, useTableExport } from "@texturehq/edges";
import { useCallback, useMemo } from "react";
import { useExplorer } from "../ExplorerContext";
import { getAllPrograms, getAllUtilities, searchEntities, sortByName } from "@/lib/data";
import { AssetTypeLabel, CompensationTypeLabel, CompensationUnitLabel, type Program } from "@/types/programs";

const assetTypeFilterOptions = [
  { id: "all", label: "All Asset Types", value: "all" },
  { id: "BATTERY", label: "Battery Storage", value: "BATTERY" },
  { id: "THERMOSTAT", label: "Smart Thermostat", value: "THERMOSTAT" },
  { id: "EV_CHARGER", label: "EV Charger", value: "EV_CHARGER" },
  { id: "WATER_HEATER", label: "Water Heater", value: "WATER_HEATER" },
  { id: "HVAC", label: "HVAC", value: "HVAC" },
  { id: "SOLAR_PV", label: "Solar PV", value: "SOLAR_PV" },
  { id: "POOL_PUMP", label: "Pool Pump", value: "POOL_PUMP" },
  { id: "GENERATOR", label: "Generator", value: "GENERATOR" },
];

interface ProgramRow extends Record<string, unknown> {
  slug: string;
  name: string;
  utilityName: string;
  assetTypes: string[];
  status: string;
  compensationSummary: string;
  programWebsite: string | null | undefined;
}

function getPrimaryCompensationSummary(program: Program): string {
  if (!program.compensationTiers || program.compensationTiers.length === 0) return "";
  const tier = program.compensationTiers[0];
  const typeLabel = CompensationTypeLabel[tier.type] ?? tier.type;
  const unitLabel = CompensationUnitLabel[tier.unit] ?? tier.unit;
  return `$${tier.amount} ${typeLabel.toLowerCase()} ${unitLabel}`;
}

export function ProgramListPanel() {
  const { state, setSearch, setTypeFilter, navigateToDetail } = useExplorer();

  const utilities = useMemo(() => getAllUtilities(), []);

  const allPrograms = useMemo((): ProgramRow[] => {
    const programs = getAllPrograms();
    return programs.map((prog) => {
      const adminOrg = prog.organizations.find((o) => o.role === "ADMINISTRATOR");
      const utility = adminOrg ? utilities.find((u) => u.slug === adminOrg.entityId) : null;
      return {
        slug: prog.slug,
        name: prog.name,
        utilityName: utility?.name ?? adminOrg?.entityId ?? "—",
        assetTypes: prog.assetTypes,
        status: prog.status,
        compensationSummary: getPrimaryCompensationSummary(prog),
        programWebsite: prog.programWebsite,
      };
    });
  }, [utilities]);

  const filtered = useMemo(() => {
    let result = allPrograms;
    if (state.q) {
      result = searchEntities(result, state.q);
    }
    if (state.type !== "all") {
      result = result.filter((p) => (p.assetTypes as string[]).includes(state.type));
    }
    result = sortByName(result, "asc");
    return result;
  }, [allPrograms, state.q, state.type]);

  const handleRowClick = useCallback(
    (row: ProgramRow) => {
      navigateToDetail("program", row.slug);
    },
    [navigateToDetail]
  );

  const exportColumns: Column<ProgramRow>[] = useMemo(
    () => [
      { id: "name", label: "Program", accessor: "name" },
      { id: "utilityName", label: "Utility", accessor: "utilityName" },
      { id: "assetTypes", label: "Asset Types", accessor: "assetTypes" },
      { id: "status", label: "Status", accessor: "status" },
      { id: "compensationSummary", label: "Compensation", accessor: "compensationSummary" },
      { id: "slug", label: "Slug", accessor: "slug" },
    ],
    []
  );

  const { exportCSV, canExport } = useTableExport({
    columns: exportColumns,
    data: filtered,
    metadata: { filename: "opengrid-programs" },
  });

  const columns: Column<ProgramRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Program",
        accessor: "name",
        render: (_value: unknown, row: ProgramRow) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-text-body">{row.name}</span>
            <span className="text-xs text-text-muted">{row.utilityName}</span>
          </div>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "assetTypes",
        label: "Assets",
        accessor: "assetTypes",
        render: (_value: unknown, row: ProgramRow) => (
          <div className="flex flex-wrap gap-1">
            {(row.assetTypes as string[]).map((at) => (
              <Badge key={at} size="sm" shape="pill" variant="info">
                {AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at}
              </Badge>
            ))}
          </div>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "status",
        label: "Status",
        accessor: "status",
        render: (_value: unknown, row: ProgramRow) => (
          <Badge
            size="sm"
            shape="pill"
            variant={row.status === "ACTIVE" ? "success" : row.status === "PAUSED" ? "warning" : "default"}
          >
            {row.status === "ACTIVE" ? "Active" : row.status === "PAUSED" ? "Paused" : row.status === "FULL" ? "Full" : row.status}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "compensation",
        label: "Compensation",
        accessor: "compensationSummary",
        render: (_value: unknown, row: ProgramRow) => (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-body">{row.compensationSummary as string}</span>
            {row.programWebsite && (
              <a
                href={row.programWebsite as string}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-text-muted hover:text-brand-primary transition-colors"
                title="Program website"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                  <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                </svg>
              </a>
            )}
          </div>
        ),
        mobile: false,
      },
    ],
    []
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-4">
        <DataControls
          resultsCount={{ count: filtered.length, label: "programs" }}
          search={{
            value: state.q,
            onChange: setSearch,
            onClear: () => setSearch(""),
            placeholder: "Search programs...",
          }}
          customControls={
            <div className="flex items-center gap-1">
              <select
              value={state.type}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 sm:h-8 rounded-md border border-border-default bg-background-surface px-2 text-base sm:text-sm text-text-body"
            >
              {assetTypeFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
              <button
                type="button"
                onClick={exportCSV}
                disabled={!canExport}
                title="Export CSV"
                className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-text-body hover:bg-background-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Export CSV"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                  <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                </svg>
              </button>
            </div>
          }
          sticky={true}
        />
      </div>
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <EmptyState
            icon="Lightning"
            title="No programs found"
            description={state.q ? "Try adjusting your search criteria." : "No programs in the dataset."}
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
