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
import { useCallback, useMemo, useRef, useState } from "react";
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

// All US state/territory codes present in the data
const ALL_STATE_CODES = [
  "AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI",
  "IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN",
  "MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH",
  "OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
  "WI","WV","WY",
];

/** Returns individual state codes from a comma-separated jurisdiction string */
function parseJurisdictionStates(jurisdiction: string | null): string[] {
  if (!jurisdiction) return [];
  return jurisdiction.split(",").map((s) => s.trim()).filter(Boolean);
}

/** True if the utility matches any of the selected jurisdictions */
function matchesJurisdictions(utility: Utility, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const states = parseJurisdictionStates(utility.jurisdiction);
  return selected.some((j) => states.includes(j));
}

// ---------------------------------------------------------------------------
// Jurisdiction multi-select dropdown
// ---------------------------------------------------------------------------

interface JurisdictionFilterProps {
  selected: string[];
  onChange: (jurisdictions: string[]) => void;
}

function JurisdictionFilter({ selected, onChange }: JurisdictionFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  const filteredCodes = useMemo(
    () =>
      search
        ? ALL_STATE_CODES.filter((code) =>
            code.toLowerCase().includes(search.toLowerCase())
          )
        : ALL_STATE_CODES,
    [search]
  );

  const toggle = useCallback(
    (code: string) => {
      if (selected.includes(code)) {
        onChange(selected.filter((s) => s !== code));
      } else {
        onChange([...selected, code]);
      }
    },
    [selected, onChange]
  );

  const clearAll = useCallback(() => {
    onChange([]);
    setSearch("");
  }, [onChange]);

  const label =
    selected.length === 0
      ? "All Jurisdictions"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} States`;

  return (
    <div ref={ref} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-8 inline-flex items-center gap-1.5 rounded-md border px-2 text-sm transition-colors ${
          selected.length > 0
            ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-medium"
            : "border-border-default bg-background-surface text-text-body"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear jurisdiction filter"
            className="ml-1 text-brand-primary hover:text-brand-primary/70 leading-none"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearAll();
              }
            }}
          >
            ×
          </span>
        )}
        <svg
          className={`w-3 h-3 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-border-default bg-background-surface shadow-lg flex flex-col"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Filter by jurisdiction"
        >
          {/* Search */}
          <div className="p-2 border-b border-border-default">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search states..."
              className="w-full h-7 rounded-md border border-border-default bg-background-page px-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-56 py-1">
            {filteredCodes.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-muted">No states found</div>
            ) : (
              filteredCodes.map((code) => {
                const isChecked = selected.includes(code);
                return (
                  <label
                    key={code}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-body cursor-pointer hover:bg-background-hover select-none"
                    role="option"
                    aria-selected={isChecked}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(code)}
                      className="rounded border-border-default text-brand-primary focus:ring-brand-primary"
                    />
                    {code}
                  </label>
                );
              })
            )}
          </div>

          {/* Footer */}
          {selected.length > 0 && (
            <div className="px-3 py-2 border-t border-border-default">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-text-muted hover:text-text-body transition-colors"
              >
                Clear all ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UtilitiesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState("name:asc");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);

  const allUtilities = useMemo(() => getAllUtilities(), []);

  const filtered = useMemo(() => {
    let result: Utility[] = allUtilities;
    if (searchQuery) {
      result = searchEntities(result, searchQuery);
    }
    if (segmentFilter !== "all") {
      result = result.filter((u) => u.segment === segmentFilter);
    }
    if (jurisdictions.length > 0) {
      result = result.filter((u) => matchesJurisdictions(u, jurisdictions));
    }
    const [field, direction] = sortValue.split(":");
    if (field === "name") {
      result = sortByName(result, direction as "asc" | "desc");
    }
    return result;
  }, [allUtilities, searchQuery, segmentFilter, jurisdictions, sortValue]);

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
            <div className="flex items-center gap-2">
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
              <JurisdictionFilter
                selected={jurisdictions}
                onChange={setJurisdictions}
              />
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
            description={searchQuery || jurisdictions.length > 0 ? "Try adjusting your filters." : "No utilities in the dataset."}
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
