"use client";

import {
  Badge,
  Card,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  Section,
} from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useMemo } from "react";
import { useExplorer } from "../ExplorerContext";
import { getBalancingAuthorityBySlug, getIsoById, getUtilitiesByBalancingAuthority } from "@/lib/data";
import { formatCustomerCount, formatStates, getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export function BADetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, goBack, setHighlight } = useExplorer();

  const ba = getBalancingAuthorityBySlug(slug);
  const iso = ba?.isoId ? getIsoById(ba.isoId) : null;

  useEffect(() => {
    if (!ba?.regionId) {
      setHighlight(null);
      return;
    }
    fetch(`/data/territories/ba-${ba.slug}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));

    return () => setHighlight(null);
  }, [ba?.slug, ba?.regionId, setHighlight]);

  const utilities = useMemo(() => (ba ? getUtilitiesByBalancingAuthority(ba.id) : []), [ba]);

  const utilityRows: UtilityRow[] = useMemo(
    () => utilities.map((u) => ({ slug: u.slug, name: u.name, segment: u.segment, customerCount: u.customerCount, jurisdiction: u.jurisdiction })),
    [utilities]
  );

  const handleUtilityRowClick = useCallback(
    (row: UtilityRow) => navigateToDetail("utility", row.slug),
    [navigateToDetail]
  );

  const utilityColumns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <button type="button" onClick={(e) => { e.stopPropagation(); navigateToDetail("utility", row.slug); }} className="font-medium text-text-body hover:text-brand-primary">
            {row.name}
          </button>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "segment",
        label: "Segment",
        accessor: "segment",
        render: (_value: unknown, row: UtilityRow) => (
          <Badge size="sm" shape="pill" variant={getSegmentBadgeVariant(row.segment)}>{getSegmentLabel(row.segment)}</Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "customerCount",
        label: "Customers",
        accessor: "customerCount",
        render: (_value: unknown, row: UtilityRow) => <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>,
        mobile: false,
      },
    ],
    [navigateToDetail]
  );

  if (!ba) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 pt-4 pb-2">
          <button type="button" onClick={goBack} className="text-sm text-text-muted hover:text-text-body transition-colors mb-2">&larr; Back</button>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-muted">Balancing Authority not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-none px-4 pt-4 pb-2">
        <button type="button" onClick={goBack} className="text-sm text-text-muted hover:text-text-body transition-colors mb-2">&larr; Back</button>
      </div>

      <div className="px-4 pb-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-heading">{ba.name}</h2>
          <div className="text-sm text-text-muted">{ba.shortName}</div>
        </div>

        <Section id="overview" title="Overview">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Short Name</div>
                  <div className="text-sm font-medium">{ba.shortName}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">EIA Code</div>
                  <div className="text-sm font-medium font-mono">{ba.eiaCode ?? "\u2014"}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">States</div>
                  <div className="text-sm font-medium">{formatStates(ba.states)}</div>
                </div>
                {iso && (
                  <div>
                    <div className="text-xs text-text-muted mb-0.5">ISO</div>
                    <button
                      type="button"
                      onClick={() => navigateToDetail("iso", iso.slug)}
                      className="text-sm font-medium text-brand-primary hover:underline"
                    >
                      {iso.shortName}
                    </button>
                  </div>
                )}
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Website</div>
                  <div className="text-sm font-medium">
                    {ba.website ? (
                      <a href={ba.website} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                        {safeHostname(ba.website)}
                      </a>
                    ) : "\u2014"}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        <Section id="utilities" title="Utilities">
          {utilityRows.length > 0 ? (
            <>
              <DataControls resultsCount={{ count: utilityRows.length }} />
              <Card className="p-0 overflow-hidden">
                <DataTable data={utilityRows} columns={utilityColumns} mobileBreakpoint="md" isLoading={false} onRowClick={handleUtilityRowClick} />
              </Card>
            </>
          ) : (
            <EmptyState icon="Lightning" title="No utilities" description="No utilities are linked to this balancing authority." />
          )}
        </Section>
      </div>
    </div>
  );
}
