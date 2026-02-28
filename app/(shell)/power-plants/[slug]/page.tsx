"use client";

import {
  Badge,
  Card,
  InteractiveMap,
  layer,
  Loader,
  PageLayout,
  Section,
  StatList,
  type StatItem,
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
      <PageLayout maxWidth={896}>
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

  const overviewItems: StatItem[] = [
    { id: "plantCode", label: "Plant Code", value: plant.plantCode, copyable: true },
    {
      id: "fuelType",
      label: "Fuel Type",
      value: (
        <Badge variant={getFuelBadgeVariant(plant.fuelCategory)}>
          {getFuelCategoryLabel(plant.fuelCategory)}
        </Badge>
      ),
    },
    {
      id: "status",
      label: "Status",
      value: (
        <Badge variant={getPlantStatusBadgeVariant(plant.status)}>
          {plant.status === "operable" ? "Operable" : "Proposed"}
        </Badge>
      ),
    },
    {
      id: "capacity",
      label: isProposedOnly ? "Proposed Capacity" : "Nameplate Capacity",
      value: formatCapacity(effectiveCapacity),
    },
    ...(!isProposedOnly
      ? [
          { id: "generators", label: "Generators", value: plant.generatorCount },
          { id: "operatingSince", label: "Operating Since", value: plant.operatingYear ?? null },
        ]
      : []),
    ...(isProposedOnly && plant.proposedOnlineYear
      ? [{ id: "expectedOnline", label: "Expected Online", value: plant.proposedOnlineYear }]
      : []),
    ...(!isProposedOnly && plant.proposedCapacityMw !== null && plant.proposedCapacityMw > 0
      ? [
          { id: "additionalProposed", label: "Additional Proposed", value: formatCapacity(plant.proposedCapacityMw) },
          ...(plant.proposedOnlineYear
            ? [{ id: "proposedOnlineYear", label: "Proposed Online Year", value: plant.proposedOnlineYear }]
            : []),
        ]
      : []),
    { id: "state", label: "State", value: formatStateName(plant.state) },
    ...(plant.county ? [{ id: "county", label: "County", value: plant.county }] : []),
    { id: "sector", label: "Sector", value: plant.sector ?? null },
    ...(plant.gridVoltageKv !== null
      ? [{ id: "gridVoltage", label: "Grid Voltage", value: `${plant.gridVoltageKv} kV` }]
      : []),
    ...(plant.nercRegion ? [{ id: "nercRegion", label: "NERC Region", value: plant.nercRegion }] : []),
    {
      id: "coordinates",
      label: "Coordinates",
      value: `${plant.latitude.toFixed(4)}, ${plant.longitude.toFixed(4)}`,
    },
  ];

  return (
    <PageLayout maxWidth={896}>
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
              <StatList layout="two-column" showDividers items={overviewItems} />
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

        {(utility || plant.utilityName || ba || plant.baCode) && (
          <Section id="relationships" navLabel="Relationships" title="Grid Relationships" withDivider>
            <Card variant="outlined">
              <Card.Content>
                <StatList
                  showDividers
                  items={[
                    ...(utility || plant.utilityName
                      ? [
                          {
                            id: "utility",
                            label: "Utility / Operator",
                            value: utility ? utility.name : plant.utilityName,
                            href: utility
                              ? `/grid-operators/${utility.slug}`
                              : `/grid-operators?q=${encodeURIComponent(plant.utilityName)}`,
                          },
                        ]
                      : []),
                    {
                      id: "ba",
                      label: "Balancing Authority",
                      value: ba ? ba.shortName : (plant.baCode ?? null),
                      ...(ba ? { href: `/balancing-authorities/${ba.slug}` } : {}),
                    },
                  ]}
                />
              </Card.Content>
            </Card>
          </Section>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
