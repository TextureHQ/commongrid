"use client";

import { Badge, Button, InteractiveMap, Loader, layer } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import { EntityActions } from "@/components/contributions/EntityActions";
import {
  BadgeList,
  EntityMap,
  EntityPageHeader,
  EntitySection,
  EntityStatsRow,
  FieldList,
  PortDisplay,
} from "@/components/entity";
import { useEvStation } from "@/lib/ev-charging";
import {
  getAccessLabel,
  getNetworkColor,
  getNetworkShortName,
  getStatusLabel,
  getTotalConnectors,
} from "@/types/ev-charging";

function getStatusBadgeVariant(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "E":
      return "success";
    case "P":
      return "info";
    case "T":
      return "warning";
    default:
      return "neutral";
  }
}

function getOwnerTypeLabel(code: string | null): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    P: "Private",
    FG: "Federal Government",
    SG: "State Government",
    LG: "Local Government",
    T: "Utility",
  };
  return map[code] ?? code;
}

export default function EVStationDetailPage() {
  const params = useParams<{ slug: string }>();
  const { station, isLoading } = useEvStation(params.slug);

  if (isLoading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader size={32} />
        </div>
      </div>
    );
  }

  if (!station) {
    notFound();
  }

  const networkColor = getNetworkColor(station.evNetwork);
  const totalConnectors = getTotalConnectors(station);

  const pointGeoJSON = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { name: station.stationName },
        geometry: {
          type: "Point" as const,
          coordinates: [station.longitude, station.latitude],
        },
      },
    ],
  };

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${station.streetAddress}, ${station.city}, ${station.state} ${station.zip}`
  )}`;

  return (
    <>
      <EntityPageHeader
        entityName={station.stationName}
        subtitle={
          <>
            <span>{getNetworkShortName(station.evNetwork)}</span>
            <span className="text-text-muted mx-2">·</span>
            <span>
              {station.city}, {station.state}
            </span>
            <span className="text-text-muted mx-2">·</span>
            <Badge size="sm" shape="pill" variant={getStatusBadgeVariant(station.statusCode)}>
              {getStatusLabel(station.statusCode)}
            </Badge>
          </>
        }
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "EV Charging", href: "/ev-charging" },
          { label: station.slug },
        ]}
        actions={
          <EntityActions
            entityType="ev_station"
            entityId={station.id ?? station.slug}
            entitySlug={station.slug}
            entityName={station.stationName}
            currentValues={station as unknown as Record<string, unknown>}
          />
        }
        dataSourcePaths={["data/ev-charging.json"]}
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        {/* Stats: port counts */}
        <EntityStatsRow
          stats={[
            {
              label: "Level 1 (120V)",
              value: station.evLevel1EvseNum,
              formatter: (v) => (v as number).toLocaleString(),
            },
            {
              label: "Level 2 (240V)",
              value: station.evLevel2EvseNum,
              formatter: (v) => (v as number).toLocaleString(),
            },
            {
              label: "DC Fast Charge",
              value: station.evDcFastNum,
              formatter: (v) => (v as number).toLocaleString(),
            },
            {
              label: "Total Connectors",
              value: totalConnectors > 0 ? totalConnectors : null,
              formatter: (v) => (v as number).toLocaleString(),
            },
          ]}
        />

        {/* Overview */}
        <EntitySection id="overview" title="Overview">
          <FieldList
            items={[
              { id: "network", label: "Network", value: getNetworkShortName(station.evNetwork) },
              {
                id: "status",
                label: "Status",
                value: (
                  <Badge size="sm" shape="pill" variant={getStatusBadgeVariant(station.statusCode)}>
                    {getStatusLabel(station.statusCode)}
                  </Badge>
                ),
              },
              { id: "access", label: "Access", value: getAccessLabel(station.accessCode) },
              { id: "connectors", label: "Total Connectors", value: totalConnectors },
            ]}
          />
        </EntitySection>

        {/* Charging Infrastructure */}
        <EntitySection id="charging" title="Charging Infrastructure">
          <PortDisplay
            level1Count={station.evLevel1EvseNum ?? 0}
            level2Count={station.evLevel2EvseNum ?? 0}
            dcFastCount={station.evDcFastNum ?? 0}
          />

          {station.evConnectorTypes.length > 0 && (
            <BadgeList items={station.evConnectorTypes} variant="info" label="Connector Types" />
          )}

          {station.evPricing && (
            <div className="mt-6">
              <div className="text-text-caption text-xs uppercase tracking-wide mb-2">Pricing</div>
              <div className="text-text-body text-base">{station.evPricing}</div>
            </div>
          )}
        </EntitySection>

        {/* Station Details */}
        <EntitySection id="details" title="Station Details">
          <FieldList
            items={[
              {
                id: "address",
                label: "Address",
                value: `${station.streetAddress}, ${station.city}, ${station.state} ${station.zip}`,
              },
              ...(station.facilityType
                ? [
                    {
                      id: "facilityType",
                      label: "Facility Type",
                      value: station.facilityType.replace(/_/g, " "),
                    },
                  ]
                : []),
              { id: "ownerType", label: "Owner Type", value: getOwnerTypeLabel(station.ownerTypeCode) },
              ...(station.openDate ? [{ id: "openDate", label: "Opened", value: station.openDate }] : []),
              {
                id: "coordinates",
                label: "Coordinates",
                value: `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`,
              },
              { id: "stationId", label: "Station ID", value: station.id, copyable: true },
            ]}
          />
          <div className="mt-4">
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">Get Directions →</Button>
            </a>
          </div>
        </EntitySection>

        {/* Location Map */}
        <EntitySection id="location" title="Location">
          <EntityMap>
            <InteractiveMap
              {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
              })}
              initialViewState={{
                longitude: station.longitude,
                latitude: station.latitude,
                zoom: 13,
              }}
              mapType="neutral"
              controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
              layers={[
                layer.geojson({
                  id: "station-location",
                  data: pointGeoJSON,
                  renderAs: "circle",
                  style: {
                    color: { hex: networkColor },
                    radius: 10,
                    borderWidth: 2,
                    borderColor: { hex: "#ffffff" },
                  },
                }),
              ]}
            />
          </EntityMap>
        </EntitySection>
      </div>
    </>
  );
}
