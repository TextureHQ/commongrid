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
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRtoBySlug, getUtilitiesByRto } from "@/lib/data";
import { formatCustomerCount, formatStates, getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function RtoDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const rto = getRtoBySlug(params.slug);

  if (!rto) {
    notFound();
  }

  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!rto.shortName) return;
    const fileKey = `iso-${rto.shortName.toLowerCase()}`;
    fetch(`/data/territories/${fileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBoundaryGeoJSON(data as FeatureCollection))
      .catch(() => setBoundaryGeoJSON(null));
  }, [rto.shortName]);

  const boundaryViewState = useMemo(
    () => (boundaryGeoJSON ? computeViewStateFromGeoJSON(boundaryGeoJSON) : null),
    [boundaryGeoJSON]
  );

  const utilities = useMemo(() => getUtilitiesByRto(rto.id), [rto.id]);

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

  const handleUtilityRowClick = useCallback(
    (row: UtilityRow) => {
      router.push(`/utilities/${row.slug}`);
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

  return (
    <PageLayout>
      <PageLayout.Header
        title={rto.name}
        breadcrumbs={[{ label: "Grid Operators", href: "/grid-operators" }, { label: rto.shortName }]}
      />
      <PageLayout.Content>
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Name</div>
                  <div className="font-medium">{rto.name}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Short Name</div>
                  <div className="font-medium">{rto.shortName}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">States</div>
                  <div className="font-medium">{formatStates(rto.states)}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Website</div>
                  <div className="font-medium">
                    {rto.website ? (
                      <a
                        href={rto.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                      >
                        {safeHostname(rto.website)}
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
          <Section id="boundary" navLabel="Boundary" title="RTO Boundary" withDivider>
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
                      id: "rto-boundary",
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

        <Section id="utilities" navLabel="Utilities" title="Utilities in this RTO" withDivider>
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
            <EmptyState icon="Lightning" title="No utilities" description="No utilities are linked to this RTO." />
          )}
        </Section>
      </PageLayout.Content>
    </PageLayout>
  );
}
