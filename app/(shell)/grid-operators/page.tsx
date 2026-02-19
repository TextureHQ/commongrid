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
import { getAllBalancingAuthorities, getAllIsos, getAllRtos, getIsoById, searchEntities, sortByName } from "@/lib/data";
import { formatStates } from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";

type GridOperatorType = "ISO" | "RTO" | "BA";

interface GridOperatorRow extends Record<string, unknown> {
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  type: GridOperatorType;
  states: string[];
  website: string | null;
  eiaCode: string | null;
  isoName: string | null;
  href: string;
}

const sortOptions = [
  { id: "name:asc", label: "Name A-Z", value: "name:asc" },
  { id: "name:desc", label: "Name Z-A", value: "name:desc" },
];

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

export default function GridOperatorsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [typeFilter, setTypeFilter] = useState("all");

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
        eiaCode: null,
        isoName: null,
        href: `/isos/${iso.slug}`,
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
        eiaCode: null,
        isoName: null,
        href: `/rtos/${rto.slug}`,
      }));

    const bas: GridOperatorRow[] = getAllBalancingAuthorities().map((ba) => {
      const iso = ba.isoId ? getIsoById(ba.isoId) : null;
      return {
        slug: ba.slug,
        name: ba.name,
        shortName: ba.shortName,
        logo: ba.logo,
        type: "BA" as const,
        states: ba.states,
        website: ba.website,
        eiaCode: ba.eiaCode,
        isoName: iso?.shortName ?? null,
        href: `/balancing-authorities/${ba.slug}`,
      };
    });

    return [...isos, ...rtos, ...bas];
  }, []);

  const filtered = useMemo(() => {
    let result = allOperators;
    if (searchQuery) {
      result = searchEntities(result, searchQuery);
    }
    if (typeFilter !== "all") {
      result = result.filter((op) => op.type === typeFilter);
    }
    const [field, direction] = sortValue.split(":");
    if (field === "name") {
      result = sortByName(result, direction as "asc" | "desc");
    }
    return result;
  }, [allOperators, searchQuery, typeFilter, sortValue]);

  const handleRowClick = useCallback(
    (row: GridOperatorRow) => {
      router.push(row.href);
    },
    [router]
  );

  const columns: Column<GridOperatorRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: GridOperatorRow) => (
          <Link href={row.href} className="flex items-center gap-2 font-medium text-text-body hover:text-brand-primary">
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
        id: "shortName",
        label: "Short Name",
        accessor: "shortName",
        cell: TextCell,
        mobile: { priority: 2, format: "secondary" },
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
        mobile: { priority: 3, format: "badge" },
      },
      {
        id: "states",
        label: "States",
        accessor: "states",
        render: (_value: unknown, row: GridOperatorRow) => (
          <span className="text-text-body">{formatStates(row.states)}</span>
        ),
        mobile: false,
      },
      {
        id: "website",
        label: "Website",
        accessor: "website",
        render: (_value: unknown, row: GridOperatorRow) =>
          row.website ? (
            <a
              href={row.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {safeHostname(row.website)}
            </a>
          ) : (
            "\u2014"
          ),
        mobile: false,
      },
    ],
    []
  );

  return (
    <PageLayout className="flex flex-col h-full overflow-hidden" paddingYClass="pt-8 md:pt-12" paddingXClass="px-4">
      <div className="flex-none">
        <PageLayout.Header title="Grid Operators" sticky={true} />
        <DataSourceLink paths={["data/isos.json", "data/rtos.json", "data/balancing-authorities.json"]} className="px-1 pb-2" />
      </div>
      <div className="flex-none">
        <DataControls
          resultsCount={{ count: filtered.length, label: "grid operators" }}
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            onClear: () => setSearchQuery(""),
            placeholder: "Search grid operators...",
          }}
          sort={{
            value: sortValue,
            options: sortOptions,
            onChange: setSortValue,
          }}
          customControls={
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-md border border-border-default bg-background-surface px-2 text-sm text-text-body"
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
            description={searchQuery ? "Try adjusting your search criteria." : "No grid operators in the dataset."}
            fullHeight={true}
          />
        ) : (
          <DataTable
            className="border-r border-l"
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
    </PageLayout>
  );
}
