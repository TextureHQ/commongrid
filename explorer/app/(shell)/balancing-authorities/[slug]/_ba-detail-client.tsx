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
import { notFound, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBalancingAuthorityBySlug, getIsoById, getUtilitiesByBalancingAuthority } from "@/lib/data";
import { formatCustomerCount, formatStates, getSegmentBadgeVariant, getSegmentLabel } from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

interface BADetailClientProps {
  slug: string;
  mapboxAccessToken?: string;
}

export function BADetailClient({ slug, mapboxAccessToken }: BADetailClientProps) {
  const router = useRouter();
  const ba = getBalancingAuthorityBySlug(slug);

  if (!ba) {
    notFound();
  }

  const iso = ba.isoId ? getIsoById(ba.isoId) : null;

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!ba.regionId) return;
    fetch(`/data/territories/ba-${ba.slug}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection))
      .catch(() => setTerritoryGeoJSON(null));
  }, [ba.slug, ba.regionId]);

  const territoryViewState = useMemo(
    () => (territoryGeoJSON ? computeViewStateFromGeoJSON(territoryGeoJSON) : null),
    [territoryGeoJSON]
  );

  const utilities = useMemo(() => getUtilitiesByBalancingAuthority(ba.id), [ba.id]);

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
        title={ba.name}
        breadcrumbs={[{ label: "Grid Operators", href: "/grid-operators" }, { label: ba.shortName }]}
      />
      <PageLayout.Content>
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Name</div>
                  <div className="font-medium">{ba.name}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Short Name</div>
                  <div className="font-medium">{ba.shortName}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">EIA Code</div>
                  <div className="font-medium font-mono">{ba.eiaCode ?? "\u2014"}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">States</div>
                  <div className="font-medium">{formatStates(ba.states)}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">ISO</div>
                  <div className="font-medium">
                    {iso ? (
                      <Link href={`/isos/${iso.slug}`} className="text-brand-primary hover:underline">
                        {iso.shortName}
                      </Link>
                    ) : (
                      "\u2014"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Website</div>
                  <div className="font-medium">
                    {ba.website ? (
                      <a
                        href={ba.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                      >
                        {safeHostname(ba.website)}
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

        {territoryGeoJSON && territoryViewState && (
          <Section id="territory" navLabel="Territory" title="Territory" withDivider>
            <Card variant="outlined" className="p-0 overflow-hidden">
              <div className="h-[400px]">
                <InteractiveMap
                  {...(mapboxAccessToken && { mapboxAccessToken })}
                  initialViewState={territoryViewState}
                  mapType="neutral"
                  controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                  layers={[
                    layer.geojson({
                      id: "ba-territory",
                      data: territoryGeoJSON,
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

        <Section id="utilities" navLabel="Utilities" title="Utilities in this BA" withDivider>
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
            <EmptyState
              icon="Lightning"
              title="No utilities"
              description="No utilities are linked to this balancing authority."
            />
          )}
        </Section>
      </PageLayout.Content>
    </PageLayout>
  );
}
