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
import { getBalancingAuthoritiesByIso, getIsoBySlug, getUtilitiesByIso } from "@/lib/data";
import { formatCustomerCount, formatStates, getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

interface BalancingAuthorityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  shortName: string;
  eiaCode: string | null;
  states: string[];
}

export function IsoDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, goBack, setHighlight } = useExplorer();

  const iso = getIsoBySlug(slug);

  // Load boundary GeoJSON for map highlight
  useEffect(() => {
    if (!iso?.shortName) {
      setHighlight(null);
      return;
    }
    const fileKey = `iso-${iso.shortName.toLowerCase()}`;
    fetch(`/data/territories/${fileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));

    return () => setHighlight(null);
  }, [iso?.shortName, setHighlight]);

  const utilities = useMemo(() => (iso ? getUtilitiesByIso(iso.id) : []), [iso]);
  const balancingAuthorities = useMemo(() => (iso ? getBalancingAuthoritiesByIso(iso.id) : []), [iso]);

  const utilityRows: UtilityRow[] = useMemo(
    () => utilities.map((u) => ({ slug: u.slug, name: u.name, segment: u.segment, customerCount: u.customerCount, jurisdiction: u.jurisdiction })),
    [utilities]
  );

  const baRows: BalancingAuthorityRow[] = useMemo(
    () => balancingAuthorities.map((ba) => ({ slug: ba.slug, name: ba.name, shortName: ba.shortName, eiaCode: ba.eiaCode, states: ba.states })),
    [balancingAuthorities]
  );

  const handleUtilityRowClick = useCallback(
    (row: UtilityRow) => navigateToDetail("utility", row.slug),
    [navigateToDetail]
  );

  const handleBARowClick = useCallback(
    (row: BalancingAuthorityRow) => navigateToDetail("ba", row.slug),
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

  const baColumns: Column<BalancingAuthorityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: BalancingAuthorityRow) => (
          <button type="button" onClick={(e) => { e.stopPropagation(); navigateToDetail("ba", row.slug); }} className="font-medium text-text-body hover:text-brand-primary">
            {row.name}
          </button>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "shortName",
        label: "Short Name",
        accessor: "shortName",
        mobile: { priority: 2, format: "secondary" },
      },
      {
        id: "eiaCode",
        label: "EIA Code",
        accessor: "eiaCode",
        render: (_value: unknown, row: BalancingAuthorityRow) => <span className="font-mono text-text-body">{row.eiaCode ?? "\u2014"}</span>,
        mobile: false,
      },
    ],
    [navigateToDetail]
  );

  if (!iso) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 pt-4 pb-2">
          <button type="button" onClick={goBack} className="text-sm text-text-muted hover:text-text-body transition-colors mb-2">&larr; Back</button>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-muted">ISO not found</div>
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
          <h2 className="text-lg font-semibold text-text-heading">{iso.name}</h2>
          <div className="text-sm text-text-muted">{iso.shortName}</div>
        </div>

        <Section id="overview" title="Overview">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Short Name</div>
                  <div className="text-sm font-medium">{iso.shortName}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">States</div>
                  <div className="text-sm font-medium">{formatStates(iso.states)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Website</div>
                  <div className="text-sm font-medium">
                    {iso.website ? (
                      <a href={iso.website} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                        {safeHostname(iso.website)}
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
            <EmptyState icon="Lightning" title="No utilities" description="No utilities are linked to this ISO." />
          )}
        </Section>

        <Section id="balancing-authorities" title="Balancing Authorities">
          {baRows.length > 0 ? (
            <>
              <DataControls resultsCount={{ count: baRows.length }} />
              <Card className="p-0 overflow-hidden">
                <DataTable data={baRows} columns={baColumns} mobileBreakpoint="md" isLoading={false} onRowClick={handleBARowClick} />
              </Card>
            </>
          ) : (
            <EmptyState icon="Scales" title="No balancing authorities" description="No balancing authorities are linked to this ISO." />
          )}
        </Section>
      </div>
    </div>
  );
}
