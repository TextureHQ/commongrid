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
import { useEvStation } from "@/lib/ev-charging";
import {
  getNetworkColor,
  getNetworkShortName,
  getStatusLabel,
  getAccessLabel,
  getTotalConnectors,
} from "@/types/ev-charging";

function getStatusBadgeVariant(status: string): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "E": return "success";
    case "P": return "info";
    case "T": return "warning";
    default: return "neutral";
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
      <PageLayout maxWidth={896}>
        <PageLayout.Header
          title="EV Charging Station"
          breadcrumbs={[{ label: "EV Charging", href: "/ev-charging" }]}
        />
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
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

  const overviewItems: StatItem[] = [
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
  ];

  const detailItems: StatItem[] = [
    {
      id: "address",
      label: "Address",
      value: `${station.streetAddress}, ${station.city}, ${station.state} ${station.zip}`,
    },
    ...(station.facilityType
      ? [{ id: "facilityType", label: "Facility Type", value: station.facilityType.replace(/_/g, " ") }]
      : []),
    { id: "ownerType", label: "Owner Type", value: getOwnerTypeLabel(station.ownerTypeCode) },
    ...(station.openDate ? [{ id: "openDate", label: "Opened", value: station.openDate }] : []),
    {
      id: "coordinates",
      label: "Coordinates",
      value: `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`,
    },
    { id: "stationId", label: "Station ID", value: station.id, copyable: true },
  ];

  return (
    <PageLayout maxWidth={896}>
      <PageLayout.Header
        title={station.stationName}
        breadcrumbs={[
          { label: "EV Charging", href: "/ev-charging" },
          { label: station.slug, copyable: true, copyValue: station.slug },
        ]}
      />
      <DataSourceLink paths={["data/ev-charging.json"]} className="px-4 sm:px-6 pb-2" />
      <PageLayout.Content>
        {/* Overview */}
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: networkColor }}
                />
                <div>
                  <div className="text-lg font-semibold">{station.stationName}</div>
                  <div className="text-sm text-text-muted">
                    {getNetworkShortName(station.evNetwork)}
                  </div>
                </div>
              </div>
              <StatList layout="two-column" showDividers items={overviewItems} />
            </Card.Content>
          </Card>
        </Section>

        {/* Charging Details */}
        <Section id="charging" navLabel="Charging" title="Charging Infrastructure" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Level 1 (120V)</div>
                  <div className="text-2xl font-bold text-text-heading">
                    {station.evLevel1EvseNum}
                  </div>
                  <div className="text-xs text-text-muted">ports</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Level 2 (240V)</div>
                  <div className="text-2xl font-bold text-text-heading">
                    {station.evLevel2EvseNum}
                  </div>
                  <div className="text-xs text-text-muted">ports</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">DC Fast Charge</div>
                  <div className="text-2xl font-bold text-text-heading">
                    {station.evDcFastNum}
                  </div>
                  <div className="text-xs text-text-muted">ports</div>
                </div>
              </div>

              {station.evConnectorTypes.length > 0 && (
                <div>
                  <div className="text-sm text-text-muted mb-2">Connector Types</div>
                  <div className="flex flex-wrap gap-2">
                    {station.evConnectorTypes.map((ct) => (
                      <Badge key={ct} size="sm" shape="pill" variant="info">
                        {ct}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {station.evPricing && (
                <div className="mt-4">
                  <div className="text-sm text-text-muted mb-1">Pricing</div>
                  <div className="text-sm text-text-body">{station.evPricing}</div>
                </div>
              )}
            </Card.Content>
          </Card>
        </Section>

        {/* Address & Details */}
        <Section id="details" navLabel="Details" title="Station Details" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <StatList layout="two-column" showDividers items={detailItems} />
              <div className="mt-6">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Get Directions →
                </a>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Map */}
        <Section id="location" navLabel="Location" title="Location" withDivider>
          <Card variant="outlined" className="p-0 overflow-hidden">
            <div className="h-[280px] sm:h-[400px]">
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
            </div>
          </Card>
          <div className="mt-3">
            <Link
              href="/ev-charging"
              className="text-sm text-brand-primary hover:underline"
            >
              ← Back to all EV charging stations
            </Link>
          </div>
        </Section>
      </PageLayout.Content>
    </PageLayout>
  );
}
