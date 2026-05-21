"use client";

import "../../detail-page.css";

import { Badge, InteractiveMap, Loader, layer } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import { DetailEntityList } from "@/components/detail/DetailEntityList";
import { DetailFieldList } from "@/components/detail/DetailFieldList";
import { DetailMap } from "@/components/detail/DetailMap";
import { DetailPageShell } from "@/components/detail/DetailPageShell";
import { DetailRelationships } from "@/components/detail/DetailRelationships";
import { DetailSection } from "@/components/detail/DetailSection";
import { DetailStatGrid } from "@/components/detail/DetailStatGrid";
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
      <div className="cg-detail">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0" }}>
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
      value: <span className="cg-tag">{getFuelCategoryLabel(plant.fuelCategory)}</span>,
    },
    {
      id: "status",
      label: "Status",
      value: <span className="cg-tag">{plant.status === "operable" ? "Operable" : "Proposed"}</span>,
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

  let sectionNum = 1;
  const nextNum = () => String(sectionNum++).padStart(2, "0");

  return (
    <DetailPageShell
      kicker="Power Plant"
      kickerDotColor={getFuelCategoryColor(plant.fuelCategory)}
      entityName={plant.name}
      subtitle={
        <>
          {plant.utilityName && <span>{plant.utilityName}</span>}
          {plant.utilityName && <span className="sep">·</span>}
          <span className="cg-tag">{plant.status === "operable" ? "Operable" : "Proposed"}</span>
          <span className="sep">·</span>
          <span className="cg-tag">{getFuelCategoryLabel(plant.fuelCategory)}</span>
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
    >
      {/* Key stats band */}
      {headerStats.length > 0 && <DetailStatGrid stats={headerStats} />}

      {/* 01 · Overview */}
      <DetailSection id="overview" kicker={`${nextNum()} · Overview`} title="Overview">
        <DetailFieldList
          items={overviewFields}
          columns={2}
          enableInlineEdit
          entityType="power_plant"
          entityId={plant.id ?? plant.slug}
          entityName={plant.name}
          currentValues={plant as unknown as Record<string, unknown>}
          onFieldEdited={() => {
            // Refresh the page after successful edit
            window.location.reload();
          }}
        />
      </DetailSection>

      {/* 02 · Technologies */}
      {plant.technologies.length > 0 && (
        <DetailSection id="technologies" kicker={`${nextNum()} · Technologies`} title="Technologies">
          <div className="cg-tags">
            {plant.technologies.map((tech) => (
              <span key={tech} className="cg-tag">
                {tech}
              </span>
            ))}
          </div>
          {plant.energySources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="detail-list-meta">Energy Sources</div>
              <div className="cg-tags">
                {plant.energySources.map((source) => (
                  <span key={source} className="cg-tag">
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      {/* 03 · Location */}
      <DetailSection id="location" kicker={`${nextNum()} · Location`} title="Location">
        <DetailMap>
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
        </DetailMap>
      </DetailSection>

      {/* 04 · Grid Relationships */}
      {hasRelationships && (
        <DetailSection id="relationships" kicker={`${nextNum()} · Grid`} title="Grid Relationships">
          <DetailRelationships items={relationshipItems} />
        </DetailSection>
      )}

      {/* 05 · Nearby Plants */}
      {!plantsLoading && nearbyPlants.length > 0 && (
        <DetailSection id="nearby" kicker={`${nextNum()} · Nearby`} title="Nearby Power Plants">
          <DetailEntityList
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
        </DetailSection>
      )}
    </DetailPageShell>
  );
}
