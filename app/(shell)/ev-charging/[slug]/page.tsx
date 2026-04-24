"use client";

import "../../detail-page.css";

import { Badge, InteractiveMap, Loader, layer } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import { EntityActions } from "@/components/contributions/EntityActions";
import { DetailFieldList, DetailMap, DetailPageShell, DetailSection, DetailStatGrid } from "@/components/detail";
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
      <div
        className="cg-detail"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}
      >
        <Loader size={32} />
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

  let sectionNum = 1;
  const nextNum = () => String(sectionNum++).padStart(2, "0");

  return (
    <DetailPageShell
      kicker="EV Charging Station"
      kickerDotColor={networkColor}
      entityName={station.stationName}
      subtitle={
        <>
          <span>{getNetworkShortName(station.evNetwork)}</span>
          <span className="sep">·</span>
          <span>
            {station.city}, {station.state}
          </span>
          <span className="sep">·</span>
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
    >
      {/* Stats: port counts */}
      <DetailStatGrid
        stats={[
          {
            value: station.evLevel1EvseNum != null ? String(station.evLevel1EvseNum) : null,
            label: "Level 1 (120V)",
          },
          {
            value: station.evLevel2EvseNum != null ? String(station.evLevel2EvseNum) : null,
            label: "Level 2 (240V)",
          },
          {
            value: station.evDcFastNum != null ? String(station.evDcFastNum) : null,
            label: "DC Fast Charge",
          },
          { value: totalConnectors > 0 ? String(totalConnectors) : null, label: "Total Connectors" },
        ]}
      />

      {/* 01 · Overview */}
      <DetailSection id="overview" kicker={`${nextNum()} · Overview`} title="Overview">
        <DetailFieldList
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
      </DetailSection>

      {/* 02 · Charging Infrastructure */}
      <DetailSection id="charging" kicker={`${nextNum()} · Charging`} title="Charging Infrastructure">
        {/* Port display */}
        <div className="detail-ports">
          <div className="detail-port">
            <div className="detail-port-n tabular">{station.evLevel1EvseNum ?? 0}</div>
            <div className="detail-port-label">Level 1</div>
            <div className="detail-port-sub">120V AC</div>
          </div>
          <div className="detail-port">
            <div className="detail-port-n tabular">{station.evLevel2EvseNum ?? 0}</div>
            <div className="detail-port-label">Level 2</div>
            <div className="detail-port-sub">240V AC</div>
          </div>
          <div className="detail-port">
            <div className="detail-port-n tabular">{station.evDcFastNum ?? 0}</div>
            <div className="detail-port-label">DC Fast</div>
            <div className="detail-port-sub">CCS / CHAdeMO</div>
          </div>
        </div>

        {station.evConnectorTypes.length > 0 && (
          <div>
            <div className="detail-list-meta">Connector Types</div>
            <div className="cg-tags">
              {station.evConnectorTypes.map((ct) => (
                <Badge key={ct} size="sm" shape="pill" variant="info">
                  {ct}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {station.evPricing && (
          <div className="detail-pricing">
            <div className="detail-pricing-label">Pricing</div>
            <div className="detail-pricing-text">{station.evPricing}</div>
          </div>
        )}
      </DetailSection>

      {/* 03 · Station Details */}
      <DetailSection id="details" kicker={`${nextNum()} · Details`} title="Station Details">
        <DetailFieldList
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
        <div style={{ marginTop: 16 }}>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="cg-btn cg-btn-primary">
            Get Directions →
          </a>
        </div>
      </DetailSection>

      {/* 04 · Location Map */}
      <DetailSection id="location" kicker={`${nextNum()} · Location`} title="Location">
        <DetailMap>
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
        </DetailMap>
      </DetailSection>
    </DetailPageShell>
  );
}
