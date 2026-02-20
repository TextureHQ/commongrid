"use client";

import {
  Avatar,
  Badge,
  Card,
  type Column,
  DataControls,
  DataTable,
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
import {
  getBalancingAuthorityById,
  getIsoById,
  getRegionById,
  getRtoById,
  getUtilitiesByGenerationProvider,
  getUtilitiesByParent,
  getUtilitiesByTransmissionProvider,
  getUtilityById,
  getUtilityBySlug,
} from "@/lib/data";
import {
  formatCustomerCount,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

interface ServedUtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function UtilityDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const utility = getUtilityBySlug(params.slug);

  if (!utility) {
    notFound();
  }

  const iso = utility.isoId ? getIsoById(utility.isoId) : null;
  const rto = utility.rtoId ? getRtoById(utility.rtoId) : null;
  const ba = utility.balancingAuthorityId ? getBalancingAuthorityById(utility.balancingAuthorityId) : null;
  const parent = utility.parentId ? getUtilityById(utility.parentId) : null;
  const generationProvider = utility.generationProviderId ? getUtilityById(utility.generationProviderId) : null;
  const transmissionProvider = utility.transmissionProviderId ? getUtilityById(utility.transmissionProviderId) : null;
  const successor = utility.successorId ? getUtilityById(utility.successorId) : null;

  const region = utility.serviceTerritoryId ? getRegionById(utility.serviceTerritoryId) : null;
  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  useEffect(() => {
    if (!territoryFileKey) return;
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection))
      .catch(() => setTerritoryGeoJSON(null));
  }, [territoryFileKey]);

  const territoryViewState = useMemo(
    () => (territoryGeoJSON ? computeViewStateFromGeoJSON(territoryGeoJSON) : null),
    [territoryGeoJSON]
  );

  const generationMembers = useMemo(() => getUtilitiesByGenerationProvider(utility.id), [utility.id]);
  const transmissionMembers = useMemo(() => getUtilitiesByTransmissionProvider(utility.id), [utility.id]);
  const childUtilities = useMemo(() => getUtilitiesByParent(utility.id), [utility.id]);

  const servedRows: ServedUtilityRow[] = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...generationMembers, ...transmissionMembers];
    return combined
      .filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      })
      .map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      }));
  }, [generationMembers, transmissionMembers]);

  const childRows: ServedUtilityRow[] = useMemo(
    () =>
      childUtilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [childUtilities]
  );

  const handleServedRowClick = useCallback(
    (row: ServedUtilityRow) => {
      router.push(`/utilities/${row.slug}`);
    },
    [router]
  );

  const servedColumns: Column<ServedUtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: ServedUtilityRow) => (
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
        render: (_value: unknown, row: ServedUtilityRow) => (
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
        render: (_value: unknown, row: ServedUtilityRow) => (
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

  const hasOperationsData =
    utility.peakDemandMw !== null ||
    utility.winterPeakDemandMw !== null ||
    utility.totalRevenueDollars !== null ||
    utility.totalSalesMwh !== null ||
    utility.amiMeterCount !== null ||
    utility.totalMeterCount !== null ||
    utility.nercRegion !== null ||
    utility.baCode !== null ||
    utility.hasGeneration !== null;

  const hasGridRelationships = iso || rto || ba;
  const hasUtilityRelationships = parent || generationProvider || transmissionProvider || successor;

  return (
    <PageLayout>
      <PageLayout.Header
        title={utility.name}
        breadcrumbs={[
          { label: "Utilities", href: "/utilities" },
          { label: utility.slug, copyable: true, copyValue: utility.slug },
        ]}
      />
      <DataSourceLink
        paths={[
          "data/utilities.json",
          ...(territoryFileKey ? [`data/territories/${territoryFileKey}.json`] : []),
        ]}
        className="px-4 sm:px-6 pb-2"
      />
      <PageLayout.Content>
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="flex items-center gap-4 mb-6">
                <Avatar
                  {...(utility.logo ? { src: utility.logo } : {})}
                  fullName={utility.name}
                  size="xl"
                  shape="square"
                  variant="organization"
                />
                <div>
                  <div className="text-lg font-semibold">{utility.name}</div>
                  {utility.shortName && <div className="text-sm text-text-muted">{utility.shortName}</div>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {utility.eiaName && utility.eiaName !== utility.name && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">EIA Name</div>
                    <div className="font-medium">{utility.eiaName}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-text-muted mb-1">Slug</div>
                  <div className="font-medium font-mono">{utility.slug}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Segment</div>
                  <div>
                    <Badge variant={getSegmentBadgeVariant(utility.segment)}>{getSegmentLabel(utility.segment)}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Status</div>
                  <div>
                    <Badge variant={getStatusBadgeVariant(utility.status)}>{getStatusLabel(utility.status)}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Customers</div>
                  <div className="font-medium">{formatCustomerCount(utility.customerCount)}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Jurisdiction</div>
                  <div className="font-medium">{utility.jurisdiction || "\u2014"}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">EIA ID</div>
                  <div className="font-medium font-mono">{utility.eiaId ?? "\u2014"}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Website</div>
                  <div className="font-medium">
                    {utility.website ? (
                      <a
                        href={utility.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                      >
                        {safeHostname(utility.website)}
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

        {hasOperationsData && (
          <Section id="operations" navLabel="Operations" title="Operations" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {utility.peakDemandMw !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Summer Peak Demand</div>
                      <div className="font-medium">{utility.peakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.winterPeakDemandMw !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Winter Peak Demand</div>
                      <div className="font-medium">{utility.winterPeakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.totalRevenueDollars !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Total Revenue</div>
                      <div className="font-medium">
                        {utility.totalRevenueDollars >= 1_000_000_000
                          ? `$${(utility.totalRevenueDollars / 1_000_000_000).toFixed(1)}B`
                          : utility.totalRevenueDollars >= 1_000_000
                            ? `$${(utility.totalRevenueDollars / 1_000_000).toFixed(1)}M`
                            : `$${utility.totalRevenueDollars.toLocaleString()}`}
                      </div>
                    </div>
                  )}
                  {utility.totalSalesMwh !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Total Sales</div>
                      <div className="font-medium">
                        {utility.totalSalesMwh >= 1_000_000
                          ? `${(utility.totalSalesMwh / 1_000_000).toFixed(1)}M MWh`
                          : `${utility.totalSalesMwh.toLocaleString()} MWh`}
                      </div>
                    </div>
                  )}
                  {utility.totalMeterCount !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Total Meters</div>
                      <div className="font-medium">{utility.totalMeterCount.toLocaleString()}</div>
                    </div>
                  )}
                  {utility.amiMeterCount !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">AMI Meters</div>
                      <div className="font-medium">
                        {utility.amiMeterCount.toLocaleString()}
                        {utility.totalMeterCount
                          ? ` (${Math.round((utility.amiMeterCount / utility.totalMeterCount) * 100)}%)`
                          : ""}
                      </div>
                    </div>
                  )}
                  {utility.nercRegion !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">NERC Region</div>
                      <div className="font-medium font-mono">{utility.nercRegion}</div>
                    </div>
                  )}
                  {utility.baCode !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">BA Code</div>
                      <div className="font-medium font-mono">{utility.baCode}</div>
                    </div>
                  )}
                  {utility.hasGeneration !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Activities</div>
                      <div className="flex gap-2 flex-wrap">
                        {utility.hasGeneration && (
                          <Badge size="sm" shape="pill" variant="info">
                            Generation
                          </Badge>
                        )}
                        {utility.hasTransmission && (
                          <Badge size="sm" shape="pill" variant="info">
                            Transmission
                          </Badge>
                        )}
                        {utility.hasDistribution && (
                          <Badge size="sm" shape="pill" variant="info">
                            Distribution
                          </Badge>
                        )}
                        {!utility.hasGeneration && !utility.hasTransmission && !utility.hasDistribution && (
                          <span className="text-text-muted">{"\u2014"}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {territoryGeoJSON && territoryViewState && (
          <Section id="service-territory" navLabel="Service Territory" title="Service Territory" withDivider>
            <Card variant="outlined" className="p-0 overflow-hidden">
              <div className="h-[280px] sm:h-[400px]">
                <InteractiveMap
                  {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                    mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
                  })}
                  initialViewState={territoryViewState}
                  mapType="neutral"
                  controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                  layers={[
                    layer.geojson({
                      id: "service-territory",
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

        {hasGridRelationships && (
          <Section id="grid-relationships" navLabel="Grid Relationships" title="Grid Relationships" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <div className="text-sm text-text-muted mb-1">RTO</div>
                    <div className="font-medium">
                      {rto ? (
                        <Link href={`/rtos/${rto.slug}`} className="text-brand-primary hover:underline">
                          {rto.shortName}
                        </Link>
                      ) : (
                        "\u2014"
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-text-muted mb-1">Balancing Authority</div>
                    <div className="font-medium">
                      {ba ? (
                        <Link href={`/balancing-authorities/${ba.slug}`} className="text-brand-primary hover:underline">
                          {ba.shortName}
                        </Link>
                      ) : (
                        "\u2014"
                      )}
                    </div>
                  </div>
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {hasUtilityRelationships && (
          <Section
            id="utility-relationships"
            navLabel="Utility Relationships"
            title="Utility Relationships"
            withDivider
          >
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {parent && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Parent</div>
                      <div className="font-medium">
                        <Link href={`/utilities/${parent.slug}`} className="text-brand-primary hover:underline">
                          {parent.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {generationProvider && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Generation Provider</div>
                      <div className="font-medium">
                        <Link
                          href={`/utilities/${generationProvider.slug}`}
                          className="text-brand-primary hover:underline"
                        >
                          {generationProvider.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {transmissionProvider && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Transmission Provider</div>
                      <div className="font-medium">
                        <Link
                          href={`/utilities/${transmissionProvider.slug}`}
                          className="text-brand-primary hover:underline"
                        >
                          {transmissionProvider.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {successor && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Successor</div>
                      <div className="font-medium">
                        <Link href={`/utilities/${successor.slug}`} className="text-brand-primary hover:underline">
                          {successor.name}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {servedRows.length > 0 && (
          <Section id="served-utilities" navLabel="Served Utilities" title="Served Utilities" withDivider>
            <DataControls resultsCount={{ count: servedRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={servedRows}
                columns={servedColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleServedRowClick}
              />
            </Card>
          </Section>
        )}

        {childRows.length > 0 && (
          <Section id="child-utilities" navLabel="Subsidiaries" title="Subsidiary Utilities" withDivider>
            <DataControls resultsCount={{ count: childRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={childRows}
                columns={servedColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleServedRowClick}
              />
            </Card>
          </Section>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
