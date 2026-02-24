"use client";

import {
  Badge,
  Card,
  InteractiveMap,
  layer,
  Loader,
  PageLayout,
  Section,
} from "@texturehq/edges";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { DataSourceLink } from "@/components/DataSourceLink";
import { useMemo } from "react";
import {
  getBalancingAuthorityById,
  getUtilityById,
} from "@/lib/data";
import { usePowerPlant } from "@/lib/power-plants";
import {
  formatCapacity,
  formatStateName,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getPlantStatusBadgeVariant,
} from "@/lib/formatting";

export default function PowerPlantDetailPage() {
  const params = useParams<{ slug: string }>();
  const { plant, isLoading } = usePowerPlant(params.slug);

  if (isLoading) {
    return (
      <PageLayout>
        <PageLayout.Header title="Power Plant" breadcrumbs={[{ label: "Power Plants", href: "/power-plants" }]} />
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  if (!plant) {
    notFound();
  }

  const utility = plant.utilityId ? getUtilityById(plant.utilityId) : null;
  const ba = plant.balancingAuthorityId ? getBalancingAuthorityById(plant.balancingAuthorityId) : null;

  const pointGeoJSON = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { name: plant.name },
        geometry: {
          type: "Point" as const,
          coordinates: [plant.longitude, plant.latitude],
        },
      },
    ],
  };

  const isProposedOnly = plant.status === "proposed";
  const effectiveCapacity = isProposedOnly ? plant.proposedCapacityMw : plant.totalCapacityMw;

  return (
    <PageLayout>
      <PageLayout.Header
        title={plant.name}
        breadcrumbs={[
          { label: "Power Plants", href: "/power-plants" },
          { label: plant.slug, copyable: true, copyValue: plant.slug },
        ]}
      />
      <DataSourceLink paths={["data/power-plants.json"]} className="px-4 sm:px-6 pb-2" />
      <PageLayout.Content>
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getFuelCategoryColor(plant.fuelCategory) }}
                />
                <div>
                  <div className="text-lg font-semibold">{plant.name}</div>
                  <div className="text-sm text-text-muted">{plant.utilityName}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Plant Code</div>
                  <div className="font-medium font-mono">{plant.plantCode}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Fuel Type</div>
                  <div>
                    <Badge variant={getFuelBadgeVariant(plant.fuelCategory)}>
                      {getFuelCategoryLabel(plant.fuelCategory)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Status</div>
                  <div>
                    <Badge variant={getPlantStatusBadgeVariant(plant.status)}>
                      {plant.status === "operable" ? "Operable" : "Proposed"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">
                    {isProposedOnly ? "Proposed Capacity" : "Nameplate Capacity"}
                  </div>
                  <div className="font-medium">{formatCapacity(effectiveCapacity)}</div>
                </div>
                {!isProposedOnly && (
                  <>
                    <div>
                      <div className="text-sm text-text-muted mb-1">Generators</div>
                      <div className="font-medium">{plant.generatorCount}</div>
                    </div>
                    <div>
                      <div className="text-sm text-text-muted mb-1">Operating Since</div>
                      <div className="font-medium">{plant.operatingYear ?? "\u2014"}</div>
                    </div>
                  </>
                )}
                {isProposedOnly && plant.proposedOnlineYear && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">Expected Online</div>
                    <div className="font-medium">{plant.proposedOnlineYear}</div>
                  </div>
                )}
                {!isProposedOnly && plant.proposedCapacityMw !== null && plant.proposedCapacityMw > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-text-muted mb-1">Additional Proposed</div>
                      <div className="font-medium">{formatCapacity(plant.proposedCapacityMw)}</div>
                    </div>
                    {plant.proposedOnlineYear && (
                      <div>
                        <div className="text-sm text-text-muted mb-1">Proposed Online Year</div>
                        <div className="font-medium">{plant.proposedOnlineYear}</div>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <div className="text-sm text-text-muted mb-1">State</div>
                  <div className="font-medium">{formatStateName(plant.state)}</div>
                </div>
                {plant.county && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">County</div>
                    <div className="font-medium">{plant.county}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-text-muted mb-1">Sector</div>
                  <div className="font-medium">{plant.sector || "\u2014"}</div>
                </div>
                {plant.gridVoltageKv !== null && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">Grid Voltage</div>
                    <div className="font-medium">{plant.gridVoltageKv} kV</div>
                  </div>
                )}
                {plant.nercRegion && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">NERC Region</div>
                    <div className="font-medium font-mono">{plant.nercRegion}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-text-muted mb-1">Coordinates</div>
                  <div className="font-medium font-mono text-sm">
                    {plant.latitude.toFixed(4)}, {plant.longitude.toFixed(4)}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {plant.technologies.length > 0 && (
          <Section id="technologies" navLabel="Technologies" title="Technologies" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="flex flex-wrap gap-2">
                  {plant.technologies.map((tech) => (
                    <Badge key={tech} size="sm" shape="pill" variant="default">
                      {tech}
                    </Badge>
                  ))}
                </div>
                {plant.energySources.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-text-muted mb-2">Energy Sources</div>
                    <div className="flex flex-wrap gap-2">
                      {plant.energySources.map((source) => (
                        <Badge key={source} size="sm" shape="pill" variant="info">
                          {source}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card.Content>
            </Card>
          </Section>
        )}

        <Section id="location" navLabel="Location" title="Location" withDivider>
          <Card variant="outlined" className="p-0 overflow-hidden">
            <div className="h-[280px] sm:h-[400px]">
              <InteractiveMap
                {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                  mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
                })}
                initialViewState={{
                  longitude: plant.longitude,
                  latitude: plant.latitude,
                  zoom: 10,
                }}
                mapType="neutral"
                controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                layers={[
                  layer.geojson({
                    id: "plant-location",
                    data: pointGeoJSON,
                    renderAs: "circle",
                    style: {
                      color: { hex: getFuelCategoryColor(plant.fuelCategory) },
                      radius: 8,
                      borderWidth: 2,
                      borderColor: { hex: "#ffffff" },
                    },
                  }),
                ]}
              />
            </div>
          </Card>
        </Section>

        {(utility || ba) && (
          <Section id="relationships" navLabel="Relationships" title="Grid Relationships" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-sm text-text-muted mb-1">Utility</div>
                    <div className="font-medium">
                      {utility ? (
                        <Link href={`/explore?view=utility&slug=${utility.slug}`} className="text-brand-primary hover:underline">
                          {utility.name}
                        </Link>
                      ) : (
                        plant.utilityName || "\u2014"
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-text-muted mb-1">Balancing Authority</div>
                    <div className="font-medium">
                      {ba ? (
                        <Link href={`/explore?view=ba&slug=${ba.slug}`} className="text-brand-primary hover:underline">
                          {ba.shortName}
                        </Link>
                      ) : plant.baCode ? (
                        plant.baCode
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
      </PageLayout.Content>
    </PageLayout>
  );
}
