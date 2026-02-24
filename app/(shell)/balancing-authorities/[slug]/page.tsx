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
  getBalancingAuthorityBySlug,
  getIsoById,
  getUtilitiesByBalancingAuthority,
} from "@/lib/data";
import { usePowerPlants, filterByBA } from "@/lib/power-plants";
import {
  formatCapacity,
  formatCustomerCount,
  formatStates,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentBadgeVariant,
  getSegmentLabel,
} from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function BADetailPage() {
  const params = useParams<{ slug: string }>();
  const ba = getBalancingAuthorityBySlug(params.slug);

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const iso = ba?.isoId ? getIsoById(ba.isoId) : null;

  useEffect(() => {
    if (!ba?.regionId) {
      setTerritoryLoading(false);
      return;
    }
    fetch(`/data/territories/ba-${ba.slug}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection | null))
      .catch(() => setTerritoryGeoJSON(null))
      .finally(() => setTerritoryLoading(false));
  }, [ba?.slug, ba?.regionId]);

  const utilities = useMemo(() => (ba ? getUtilitiesByBalancingAuthority(ba.id) : []), [ba]);
  const { plants: allPlants, isLoading: plantsLoading } = usePowerPlants();
  const baPowerPlants = useMemo(() => (ba ? filterByBA(allPlants, ba.id) : []), [ba, allPlants]);

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

  if (!ba) {
    notFound();
  }

  return (
    <PageLayout>
      <PageLayout.Header
        title={ba.name}
        breadcrumbs={[
          { label: "Grid Operators", href: "/explore?view=grid-operators" },
          { label: ba.slug, copyable: true, copyValue: ba.slug },
        ]}
      />
      <DataSourceLink paths={["data/balancing-authorities.json"]} className="px-4 sm:px-6 pb-2" />
      <PageLayout.Content>
        {/* Overview */}
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="mb-6">
                <div className="text-lg font-semibold">{ba.name}</div>
                <div className="text-sm text-text-muted">{ba.shortName}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        {/* Territory Map */}
        <Section id="territory" navLabel="Territory" title="Balancing Authority Region" withDivider>
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
                            id: "ba-territory",
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

        {/* Utilities */}
        <Section id="utilities" navLabel="Utilities" title="Utilities" withDivider>
          {utilityRows.length > 0 ? (
            <>
              <DataControls resultsCount={{ count: utilityRows.length }} />
              <Card className="p-0 overflow-hidden">
                <DataTable
                  data={utilityRows}
                  columns={utilityColumns}
                  mobileBreakpoint="md"
                  isLoading={false}
                  onRowClick={handleRowClick}
                />
              </Card>
            </>
          ) : (
            <EmptyState icon="Lightning" title="No utilities" description="No utilities are linked to this balancing authority." />
          )}
        </Section>

        {/* Power Plants */}
        {!plantsLoading && baPowerPlants.length > 0 && (
          <Section id="power-plants" navLabel="Plants" title="Power Plants" withDivider>
            <div className="text-sm text-text-muted mb-3">
              {baPowerPlants.length} power plant{baPowerPlants.length !== 1 ? "s" : ""} ·{" "}
              {formatCapacity(baPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0))} total capacity
            </div>
            <Card variant="outlined">
              <Card.Content>
                <div className="space-y-2">
                  {baPowerPlants.slice(0, 30).map((plant) => (
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
                  {baPowerPlants.length > 30 && (
                    <div className="text-xs text-text-muted text-center pt-2">
                      + {baPowerPlants.length - 30} more power plants
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
