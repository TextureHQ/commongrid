"use client";

import {
  Badge,
  Card,
  type Column,
  DataControls,
  DataTable,
  EmptyState,
  InteractiveMap,
  layer,
  PageLayout,
  Section,
} from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBalancingAuthoritiesByIso, getIsoBySlug, getUtilitiesByIso } from "@/lib/data";
import { formatCustomerCount, formatStates, getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

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

export default function IsoDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const iso = getIsoBySlug(params.slug);

  if (!iso) {
    notFound();
  }

  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!iso.shortName) return;
    const fileKey = `iso-${iso.shortName.toLowerCase()}`;
    fetch(`/data/territories/${fileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBoundaryGeoJSON(data as FeatureCollection))
      .catch(() => setBoundaryGeoJSON(null));
  }, [iso.shortName]);

  const boundaryViewState = useMemo(
    () => (boundaryGeoJSON ? computeViewStateFromGeoJSON(boundaryGeoJSON) : null),
    [boundaryGeoJSON]
  );

  const utilities = useMemo(() => getUtilitiesByIso(iso.id), [iso.id]);
  const balancingAuthorities = useMemo(() => getBalancingAuthoritiesByIso(iso.id), [iso.id]);

  const utilityRows: UtilityRow[] = useMemo(
    () =>
      utilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [utilities]
  );

  const baRows: BalancingAuthorityRow[] = useMemo(
    () =>
      balancingAuthorities.map((ba) => ({
        slug: ba.slug,
        name: ba.name,
        shortName: ba.shortName,
        eiaCode: ba.eiaCode,
        states: ba.states,
      })),
    [balancingAuthorities]
  );

  const handleUtilityRowClick = useCallback(
    (row: UtilityRow) => {
      router.push(`/utilities/${row.slug}`);
    },
    [router]
  );

  const handleBARowClick = useCallback(
    (row: BalancingAuthorityRow) => {
      router.push(`/balancing-authorities/${row.slug}`);
    },
    [router]
  );

  const utilityColumns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <Link href={`/utilities/${row.slug}`} className="font-medium text-text-body hover:text-brand-primary">
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
        mobile: { priority: 3, format: "secondary" },
      },
    ],
    []
  );

  const baColumns: Column<BalancingAuthorityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: BalancingAuthorityRow) => (
          <Link
            href={`/balancing-authorities/${row.slug}`}
            className="font-medium text-text-body hover:text-brand-primary"
          >
            {row.name}
          </Link>
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
        render: (_value: unknown, row: BalancingAuthorityRow) => (
          <span className="font-mono text-text-body">{row.eiaCode ?? "\u2014"}</span>
        ),
        mobile: false,
      },
      {
        id: "states",
        label: "States",
        accessor: "states",
        render: (_value: unknown, row: BalancingAuthorityRow) => (
          <span className="text-text-body">{formatStates(row.states)}</span>
        ),
        mobile: false,
      },
    ],
    []
  );

  return (
    <PageLayout>
      <PageLayout.Header
        title={iso.name}
        breadcrumbs={[{ label: "Grid Operators", href: "/grid-operators" }, { label: iso.shortName }]}
      />
      <DataSourceLink
        paths={[
          "data/isos.json",
          ...(iso.shortName ? [`data/territories/iso-${iso.shortName.toLowerCase()}.json`] : []),
        ]}
        className="px-6 pb-2"
      />
      <PageLayout.Content>
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Name</div>
                  <div className="font-medium">{iso.name}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Short Name</div>
                  <div className="font-medium">{iso.shortName}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">States</div>
                  <div className="font-medium">{formatStates(iso.states)}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Website</div>
                  <div className="font-medium">
                    {iso.website ? (
                      <a
                        href={iso.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                      >
                        {safeHostname(iso.website)}
                      </a>
                    ) : (
                      "\u2014"
                    )}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {boundaryGeoJSON && boundaryViewState && (
          <Section id="boundary" navLabel="Boundary" title="ISO Boundary" withDivider>
            <Card variant="outlined" className="p-0 overflow-hidden">
              <div className="h-[400px]">
                <InteractiveMap
                  {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                    mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
                  })}
                  initialViewState={boundaryViewState}
                  mapType="neutral"
                  controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                  layers={[
                    layer.geojson({
                      id: "iso-boundary",
                      data: boundaryGeoJSON,
                      renderAs: "fill",
                      style: {
                        color: { token: "brand-primary" },
                        fillOpacity: 0.2,
                        borderWidth: 2,
                        borderColor: { token: "brand-primary" },
                      },
                    }),
                  ]}
                />
              </div>
            </Card>
          </Section>
        )}

        <Section id="utilities" navLabel="Utilities" title="Utilities in this ISO" withDivider>
          {utilityRows.length > 0 ? (
            <>
              <DataControls resultsCount={{ count: utilityRows.length }} />
              <Card className="p-0 overflow-hidden">
                <DataTable
                  data={utilityRows}
                  columns={utilityColumns}
                  mobileBreakpoint="md"
                  isLoading={false}
                  onRowClick={handleUtilityRowClick}
                />
              </Card>
            </>
          ) : (
            <EmptyState icon="Lightning" title="No utilities" description="No utilities are linked to this ISO." />
          )}
        </Section>

        <Section
          id="balancing-authorities"
          navLabel="Balancing Authorities"
          title="Balancing Authorities in this ISO"
          withDivider
        >
          {baRows.length > 0 ? (
            <>
              <DataControls resultsCount={{ count: baRows.length }} />
              <Card className="p-0 overflow-hidden">
                <DataTable
                  data={baRows}
                  columns={baColumns}
                  mobileBreakpoint="md"
                  isLoading={false}
                  onRowClick={handleBARowClick}
                />
              </Card>
            </>
          ) : (
            <EmptyState
              icon="Scales"
              title="No balancing authorities"
              description="No balancing authorities are linked to this ISO."
            />
          )}
        </Section>
      </PageLayout.Content>
    </PageLayout>
  );
}
