"use client";

import { Badge, InteractiveMap, Loader, layer } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import {
  BadgeList,
  EntityList,
  EntityMap,
  EntityPageHeader,
  EntitySection,
  EntityStatsRow,
  FieldList,
  RelationshipCards,
} from "@/components/entity";
import { getBalancingAuthorityById } from "@/lib/data";
import {
  formatCapacity,
  formatStateName,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
} from "@/lib/formatting";
import { usePowerPlant, usePowerPlants } from "@/lib/power-plants";
import { useUtilities } from "@/lib/utilities-client";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PowerPlantDetailPage() {
  const params = useParams<{ slug: string }>();
  const { plant, isLoading } = usePowerPlant(params.slug);
  const { utilities } = useUtilities();
  const { plants: allPlants, isLoading: plantsLoading } = usePowerPlants();

  const nearbyPlants = useMemo(() => {
    if (!plant || allPlants.length === 0) return [];
    return allPlants
      .filter((p) => p.slug !== plant.slug)
      .map((p) => ({
        ...p,
        distance: haversineDistance(plant.latitude, plant.longitude, p.latitude, p.longitude),
      }))
      .filter((p) => p.distance < 50) // within 50 miles
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [plant, allPlants]);

  if (isLoading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </div>
    );
  }

  if (!plant) {
    notFound();
  }

  const utility = plant.utilityId ? (utilities.find((u) => u.id === plant.utilityId) ?? null) : null;
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

  // Header stats band
  const headerStats = [
    {
      value: formatCapacity(effectiveCapacity),
      label: isProposedOnly ? "Proposed Capacity" : "Nameplate Capacity",
    },
    ...(!isProposedOnly && plant.generatorCount ? [{ value: String(plant.generatorCount), label: "Generators" }] : []),
    ...(!isProposedOnly && plant.operatingYear
      ? [{ value: String(plant.operatingYear), label: "Operating Since" }]
      : []),
    ...(isProposedOnly && plant.proposedOnlineYear
      ? [{ value: String(plant.proposedOnlineYear), label: "Expected Online" }]
      : []),
  ].filter((s) => s.value !== null && s.value !== undefined) as { value: string; label: string }[];

  // Overview fields
  const overviewFields = [
    { id: "plantCode", label: "Plant Code", value: plant.plantCode, copyable: true },
    {
      id: "fuelType",
      label: "Fuel Type",
      value: <Badge variant="neutral">{getFuelCategoryLabel(plant.fuelCategory)}</Badge>,
    },
    {
      id: "status",
      label: "Status",
      value: <Badge variant="neutral">{plant.status === "operable" ? "Operable" : "Proposed"}</Badge>,
    },
    {
      id: "capacity",
      label: isProposedOnly ? "Proposed Capacity" : "Nameplate Capacity",
      value: formatCapacity(effectiveCapacity),
      editable: !isProposedOnly,
      fieldName: "total_capacity_mw",
    },
    ...(!isProposedOnly
      ? [
          { id: "generators", label: "Generators", value: plant.generatorCount },
          {
            id: "operatingSince",
            label: "Operating Since",
            value: plant.operatingYear ?? null,
            editable: true,
            fieldName: "operating_year",
          },
        ]
      : []),
    ...(isProposedOnly && plant.proposedOnlineYear
      ? [
          {
            id: "expectedOnline",
            label: "Expected Online",
            value: plant.proposedOnlineYear,
            editable: true,
            fieldName: "proposed_online_year",
          },
        ]
      : []),
    ...(!isProposedOnly && plant.proposedCapacityMw !== null && plant.proposedCapacityMw > 0
      ? [
          {
            id: "additionalProposed",
            label: "Additional Proposed",
            value: formatCapacity(plant.proposedCapacityMw),
            editable: true,
            fieldName: "proposed_capacity_mw",
          },
          ...(plant.proposedOnlineYear
            ? [
                {
                  id: "proposedOnlineYear",
                  label: "Proposed Online Year",
                  value: plant.proposedOnlineYear,
                  editable: true,
                  fieldName: "proposed_online_year",
                },
              ]
            : []),
        ]
      : []),
    { id: "state", label: "State", value: formatStateName(plant.state) },
    ...(plant.county
      ? [{ id: "county", label: "County", value: plant.county, editable: true, fieldName: "county" }]
      : []),
    { id: "sector", label: "Sector", value: plant.sector ?? null },
    ...(plant.gridVoltageKv !== null
      ? [
          {
            id: "gridVoltage",
            label: "Grid Voltage",
            value: `${plant.gridVoltageKv} kV`,
            editable: true,
            fieldName: "grid_voltage_kv",
          },
        ]
      : []),
    ...(plant.nercRegion ? [{ id: "nercRegion", label: "NERC Region", value: plant.nercRegion }] : []),
    {
      id: "coordinates",
      label: "Coordinates",
      value: `${plant.latitude.toFixed(4)}, ${plant.longitude.toFixed(4)}`,
    },
  ];

  // Grid relationships
  const hasRelationships = utility || plant.utilityName || ba || plant.baCode;
  const relationshipItems = [
    ...(utility || plant.utilityName
      ? [
          {
            label: "Utility / Operator",
            name: utility ? utility.name : plant.utilityName,
            href: utility
              ? `/grid-operators/${utility.slug}`
              : `/grid-operators?q=${encodeURIComponent(plant.utilityName)}`,
          },
        ]
      : []),
    ...(ba || plant.baCode
      ? [
          {
            label: "Balancing Authority",
            name: ba ? ba.shortName : (plant.baCode ?? ""),
            ...(ba ? { href: `/balancing-authorities/${ba.slug}` } : {}),
          },
        ]
      : []),
  ];

  return (
    <>
      <EntityPageHeader
        entityName={plant.name}
        subtitle={
          <>
            {plant.utilityName && <span>{plant.utilityName}</span>}
            {plant.utilityName && <span className="text-text-muted mx-2">·</span>}
            <Badge variant="neutral">{plant.status === "operable" ? "Operable" : "Proposed"}</Badge>
            <span className="text-text-muted mx-2">·</span>
            <Badge variant="neutral">{getFuelCategoryLabel(plant.fuelCategory)}</Badge>
          </>
        }
        breadcrumbs={[{ label: "Power Plants", href: "/power-plants" }, { label: plant.slug }]}
        actions={
          <EntityActions
            entityType="power_plant"
            entityId={plant.id ?? plant.slug}
            entitySlug={plant.slug}
            entityName={plant.name}
            currentValues={plant as unknown as Record<string, unknown>}
          />
        }
        dataSourcePaths={["data/power-plants.json"]}
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        {/* Key stats band */}
        {headerStats.length > 0 && <EntityStatsRow stats={headerStats} />}

        {/* Overview */}
        <EntitySection id="overview" title="Overview">
          <FieldList
            items={overviewFields}
            columns={2}
            enableInlineEdit
            entityType="power_plant"
            entityId={plant.id ?? plant.slug}
            entityName={plant.name}
            currentValues={plant as unknown as Record<string, unknown>}
            onFieldEdited={() => {
              window.location.reload();
            }}
          />
        </EntitySection>

        {/* Technologies */}
        {plant.technologies.length > 0 && (
          <EntitySection id="technologies" title="Technologies">
            <BadgeList items={plant.technologies} variant="neutral" />
            {plant.energySources.length > 0 && (
              <div className="mt-6">
                <BadgeList items={plant.energySources} variant="neutral" label="Energy Sources" />
              </div>
            )}
          </EntitySection>
        )}

        {/* Location */}
        <EntitySection id="location" title="Location">
          <EntityMap>
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
          </EntityMap>
        </EntitySection>

        {/* Grid Relationships */}
        {hasRelationships && (
          <EntitySection id="relationships" title="Grid Relationships">
            <RelationshipCards items={relationshipItems} />
          </EntitySection>
        )}

        {/* Nearby Plants */}
        {!plantsLoading && nearbyPlants.length > 0 && (
          <EntitySection id="nearby" title="Nearby Power Plants">
            <EntityList
              items={nearbyPlants.map((p) => ({
                href: `/power-plants/${p.slug}`,
                name: p.name,
                dotColor: getFuelCategoryColor(p.fuelCategory),
                badge: (
                  <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(p.fuelCategory)}>
                    {getFuelCategoryLabel(p.fuelCategory)}
                  </Badge>
                ),
                meta: `${formatCapacity(p.totalCapacityMw)} · ${Math.round(p.distance)} mi`,
              }))}
              headerMeta={`${nearbyPlants.length} plants within 50 miles`}
            />
          </EntitySection>
        )}
      </div>
    </>
  );
}
