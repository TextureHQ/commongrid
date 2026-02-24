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
  Loader,
  PageLayout,
  Section,
} from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataSourceLink } from "@/components/DataSourceLink";
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
import { usePowerPlants, filterByUtility } from "@/lib/power-plants";
import {
  formatCapacity,
  formatCustomerCount,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function UtilityDetailPage() {
  const params = useParams<{ slug: string }>();
  const utility = getUtilityBySlug(params.slug);

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const iso = utility?.isoId ? getIsoById(utility.isoId) : null;
  const rto = utility?.rtoId ? getRtoById(utility.rtoId) : null;
  const ba = utility?.balancingAuthorityId ? getBalancingAuthorityById(utility.balancingAuthorityId) : null;
  const parent = utility?.parentId ? getUtilityById(utility.parentId) : null;
  const generationProvider = utility?.generationProviderId ? getUtilityById(utility.generationProviderId) : null;
  const transmissionProvider = utility?.transmissionProviderId ? getUtilityById(utility.transmissionProviderId) : null;
  const successor = utility?.successorId ? getUtilityById(utility.successorId) : null;
  const region = utility?.serviceTerritoryId ? getRegionById(utility.serviceTerritoryId) : null;

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  useEffect(() => {
    if (!territoryFileKey) {
      setTerritoryLoading(false);
      return;
    }
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection | null))
      .catch(() => setTerritoryGeoJSON(null))
      .finally(() => setTerritoryLoading(false));
  }, [territoryFileKey]);

  const generationMembers = useMemo(() => (utility ? getUtilitiesByGenerationProvider(utility.id) : []), [utility]);
  const transmissionMembers = useMemo(() => (utility ? getUtilitiesByTransmissionProvider(utility.id) : []), [utility]);
  const childUtilities = useMemo(() => (utility ? getUtilitiesByParent(utility.id) : []), [utility]);

  const servedRows: UtilityRow[] = useMemo(() => {
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

  const childRows: UtilityRow[] = useMemo(
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

  const { plants: allPlants, isLoading: plantsLoading } = usePowerPlants();
  const utilityPowerPlants = useMemo(
    () => (utility ? filterByUtility(allPlants, utility.id) : []),
    [utility, allPlants]
  );

  const utilityColumns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <Link href={`/grid-operators/${row.slug}`} className="font-medium text-text-body hover:text-brand-primary">
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
    ],
    []
  );

  const handleRowClick = useCallback((row: UtilityRow) => {
    window.location.href = `/grid-operators/${row.slug}`;
  }, []);

  const mapViewState = useMemo(() => {
    if (territoryGeoJSON) {
      return computeViewStateFromGeoJSON(territoryGeoJSON) ?? { longitude: -98.58, latitude: 39.83, zoom: 4 };
    }
    return { longitude: -98.58, latitude: 39.83, zoom: 4 };
  }, [territoryGeoJSON]);

  if (!utility) {
    notFound();
  }

  const hasOperationsData =
    utility.peakDemandMw !== null ||
    utility.winterPeakDemandMw !== null ||
    utility.totalRevenueDollars !== null ||
    utility.totalSalesMwh !== null ||
    utility.amiMeterCount !== null ||
    utility.totalMeterCount !== null ||
    utility.nercRegion !== null ||
    utility.hasGeneration !== null;

  const hasGridRelationships = iso || rto || ba;
  const hasUtilityRelationships = parent || generationProvider || transmissionProvider || successor;

  return (
    <PageLayout>
      <PageLayout.Header
        title={utility.name}
        breadcrumbs={[
          { label: "Grid Operators", href: "/grid-operators" },
          { label: utility.slug, copyable: true, copyValue: utility.slug },
        ]}
      />
      <DataSourceLink paths={["data/utilities.json"]} className="px-4 sm:px-6 pb-2" />
      <PageLayout.Content>
        {/* Overview */}
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="flex items-center gap-3 mb-6">
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
                <div>
                  <div className="text-sm text-text-muted mb-1">Segment</div>
                  <Badge variant={getSegmentBadgeVariant(utility.segment)}>
                    {getSegmentLabel(utility.segment)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Status</div>
                  <Badge variant={getStatusBadgeVariant(utility.status)}>
                    {getStatusLabel(utility.status)}
                  </Badge>
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

        {/* Operations */}
        {hasOperationsData && (
          <Section id="operations" navLabel="Operations" title="Operations" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {utility.peakDemandMw !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Summer Peak</div>
                      <div className="font-medium">{utility.peakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.winterPeakDemandMw !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Winter Peak</div>
                      <div className="font-medium">{utility.winterPeakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.totalRevenueDollars !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Revenue</div>
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
                      <div className="text-sm text-text-muted mb-1">Sales</div>
                      <div className="font-medium">
                        {utility.totalSalesMwh >= 1_000_000
                          ? `${(utility.totalSalesMwh / 1_000_000).toFixed(1)}M MWh`
                          : `${utility.totalSalesMwh.toLocaleString()} MWh`}
                      </div>
                    </div>
                  )}
                  {utility.totalMeterCount !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Meters</div>
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
                  {utility.hasGeneration !== null && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Activities</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {utility.hasGeneration && <Badge size="sm" shape="pill" variant="info">Generation</Badge>}
                        {utility.hasTransmission && <Badge size="sm" shape="pill" variant="info">Transmission</Badge>}
                        {utility.hasDistribution && <Badge size="sm" shape="pill" variant="info">Distribution</Badge>}
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

        {/* Service Territory Map */}
        <Section id="territory" navLabel="Territory" title="Service Territory" withDivider>
          <Card variant="outlined" className="p-0 overflow-hidden">
            <div className="h-[280px] sm:h-[400px]">
              {territoryLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader size={32} />
                </div>
              ) : (
                <InteractiveMap
                  {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                    mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
                  })}
                  initialViewState={mapViewState}
                  mapType="neutral"
                  controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                  layers={
                    territoryGeoJSON
                      ? [
                          layer.geojson({
                            id: "territory-fill",
                            data: territoryGeoJSON,
                            renderAs: "fill",
                            style: {
                              color: { token: "brand-primary" },
                              fillOpacity: 0.25,
                              borderWidth: 3,
                              borderColor: { token: "brand-primary" },
                            },
                          }),
                        ]
                      : []
                  }
                />
              )}
            </div>
          </Card>
        </Section>

        {/* Grid Relationships */}
        {hasGridRelationships && (
          <Section id="grid" navLabel="Grid" title="Grid Relationships" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {iso && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">ISO</div>
                      <div className="font-medium">
                        <Link
                          href={`/explore?view=iso&slug=${iso.slug}`}
                          className="text-brand-primary hover:underline"
                        >
                          {iso.shortName}
                        </Link>
                      </div>
                    </div>
                  )}
                  {rto && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">RTO</div>
                      <div className="font-medium">
                        <Link
                          href={`/explore?view=rto&slug=${rto.slug}`}
                          className="text-brand-primary hover:underline"
                        >
                          {rto.shortName}
                        </Link>
                      </div>
                    </div>
                  )}
                  {ba && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Balancing Authority</div>
                      <div className="font-medium">
                        <Link
                          href={`/balancing-authorities/${ba.slug}`}
                          className="text-brand-primary hover:underline"
                        >
                          {ba.shortName}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Utility Relationships */}
        {hasUtilityRelationships && (
          <Section id="relationships" navLabel="Relationships" title="Utility Relationships" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {parent && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Parent</div>
                      <div className="font-medium">
                        <Link href={`/grid-operators/${parent.slug}`} className="text-brand-primary hover:underline">
                          {parent.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {generationProvider && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Generation Provider</div>
                      <div className="font-medium">
                        <Link href={`/grid-operators/${generationProvider.slug}`} className="text-brand-primary hover:underline">
                          {generationProvider.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {transmissionProvider && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Transmission Provider</div>
                      <div className="font-medium">
                        <Link href={`/grid-operators/${transmissionProvider.slug}`} className="text-brand-primary hover:underline">
                          {transmissionProvider.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {successor && (
                    <div>
                      <div className="text-sm text-text-muted mb-1">Successor</div>
                      <div className="font-medium">
                        <Link href={`/grid-operators/${successor.slug}`} className="text-brand-primary hover:underline">
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

        {/* Served Utilities */}
        {servedRows.length > 0 && (
          <Section id="served" navLabel="Served" title="Served Utilities" withDivider>
            <DataControls resultsCount={{ count: servedRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={servedRows}
                columns={utilityColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleRowClick}
              />
            </Card>
          </Section>
        )}

        {/* Subsidiaries */}
        {childRows.length > 0 && (
          <Section id="subsidiaries" navLabel="Subsidiaries" title="Subsidiary Utilities" withDivider>
            <DataControls resultsCount={{ count: childRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={childRows}
                columns={utilityColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleRowClick}
              />
            </Card>
          </Section>
        )}

        {/* Power Plants */}
        {!plantsLoading && utilityPowerPlants.length > 0 && (
          <Section id="power-plants" navLabel="Plants" title="Power Plants" withDivider>
            <div className="text-sm text-text-muted mb-3">
              {utilityPowerPlants.length} power plant{utilityPowerPlants.length !== 1 ? "s" : ""} ·{" "}
              {formatCapacity(utilityPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0))} total capacity
            </div>
            <Card variant="outlined">
              <Card.Content>
                <div className="space-y-2">
                  {utilityPowerPlants.slice(0, 30).map((plant) => (
                    <Link
                      key={plant.id}
                      href={`/power-plants/${plant.slug}`}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-background-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getFuelCategoryColor(plant.fuelCategory) }}
                        />
                        <span className="text-sm font-medium text-text-body truncate">{plant.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(plant.fuelCategory)}>
                          {getFuelCategoryLabel(plant.fuelCategory)}
                        </Badge>
                        <span className="text-xs text-text-muted">{formatCapacity(plant.totalCapacityMw)}</span>
                      </div>
                    </Link>
                  ))}
                  {utilityPowerPlants.length > 30 && (
                    <div className="text-xs text-text-muted text-center pt-2">
                      + {utilityPowerPlants.length - 30} more power plants
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
