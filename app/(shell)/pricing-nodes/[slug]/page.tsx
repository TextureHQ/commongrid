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
import { usePricingNode, usePricingNodes } from "@/lib/pricing-nodes";
import { getIsoColor, ISO_FULL_NAMES, ISO_LABELS, NODE_TYPE_LABELS } from "@/types/pricing-nodes";

export default function PricingNodeDetailPage() {
  const params = useParams<{ slug: string }>();
  const { node, isLoading } = usePricingNode(params.slug);
  const { nodes: allNodes, isLoading: nodesLoading } = usePricingNodes();

  const nearbyNodes = useMemo(() => {
    if (!node || allNodes.length === 0) return [];
    return allNodes
      .filter((n) => n.slug !== node.slug && n.iso === node.iso)
      .filter((n) => {
        const dLat = Math.abs(n.latitude - node.latitude);
        const dLon = Math.abs(n.longitude - node.longitude);
        return dLat < 1 && dLon < 1; // roughly within ~70 miles
      })
      .slice(0, 10);
  }, [node, allNodes]);

  if (isLoading) {
    return (
      <div className="cg-detail">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0" }}>
          <Loader size={32} />
        </div>
      </div>
    );
  }

  if (!node) {
    notFound();
  }

  const isoColor = getIsoColor(node.iso);

  const pointGeoJSON = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { name: node.name },
        geometry: {
          type: "Point" as const,
          coordinates: [node.longitude, node.latitude],
        },
      },
    ],
  };

  // Header stats band
  const headerStats = [
    { value: ISO_LABELS[node.iso], label: "ISO/RTO" },
    { value: NODE_TYPE_LABELS[node.nodeType], label: "Node Type" },
    ...(node.zone ? [{ value: node.zone, label: "Zone" }] : []),
    ...(node.state ? [{ value: node.state, label: "State" }] : []),
  ] as { value: string; label: string }[];

  // Overview fields
  const overviewFields = [
    { id: "iso", label: "ISO/RTO", value: ISO_FULL_NAMES[node.iso] },
    {
      id: "nodeType",
      label: "Node Type",
      value: <span className="cg-tag">{NODE_TYPE_LABELS[node.nodeType]}</span>,
    },
    { id: "zone", label: "Zone", value: node.zone ?? null },
    { id: "state", label: "State", value: node.state ?? null },
    { id: "source", label: "Data Source", value: node.source },
    { id: "nodeId", label: "Node ID", value: node.id, copyable: true },
  ];

  // Location fields
  const locationFields = [
    { id: "latitude", label: "Latitude", value: node.latitude.toFixed(4) },
    { id: "longitude", label: "Longitude", value: node.longitude.toFixed(4) },
    ...(node.voltageKv ? [{ id: "voltage", label: "Voltage", value: `${node.voltageKv} kV` }] : []),
    ...(node.eiaPlantCode
      ? [
          {
            id: "eiaPlantCode",
            label: "EIA Plant Code",
            value: node.eiaPlantCode,
            href: `/power-plants/${node.eiaPlantCode}`,
          },
        ]
      : []),
  ];

  let sectionNum = 1;
  const nextNum = () => String(sectionNum++).padStart(2, "0");

  return (
    <DetailPageShell
      kicker="Pricing Node"
      kickerDotColor={isoColor}
      entityName={node.name}
      subtitle={
        <>
          <span>{ISO_LABELS[node.iso]}</span>
          <span className="sep">·</span>
          <span className="cg-tag">{NODE_TYPE_LABELS[node.nodeType]}</span>
        </>
      }
      breadcrumbs={[{ label: "Pricing Nodes", href: "/pricing-nodes" }, { label: node.slug }]}
      actions={
        <EntityActions
          entityType="pricing_node"
          entityId={node.id ?? node.slug}
          entitySlug={node.slug}
          entityName={node.name}
          currentValues={node as unknown as Record<string, unknown>}
        />
      }
      dataSourcePaths={["data/pricing-nodes.json"]}
    >
      {/* Key stats band */}
      <DetailStatGrid stats={headerStats} />

      {/* 01 · Overview */}
      <DetailSection id="overview" kicker={`${nextNum()} · Overview`} title="Overview">
        <DetailFieldList items={overviewFields} columns={2} />
      </DetailSection>

      {/* 02 · Location Details */}
      <DetailSection id="location-details" kicker={`${nextNum()} · Coordinates`} title="Location Details">
        <DetailFieldList items={locationFields} columns={2} />
      </DetailSection>

      {/* 03 · Map */}
      {process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && (
        <DetailSection id="map" kicker={`${nextNum()} · Map`} title="Map">
          <DetailMap>
            <InteractiveMap
              mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
              initialViewState={{
                longitude: node.longitude,
                latitude: node.latitude,
                zoom: node.nodeType === "zone" || node.nodeType === "hub" ? 6 : 10,
              }}
              mapType="neutral"
              controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
              layers={[
                layer.geojson({
                  id: "node-point",
                  data: pointGeoJSON,
                  renderAs: "circle",
                  style: {
                    color: { hex: isoColor },
                    radius: 8,
                    borderWidth: 2,
                    borderColor: { hex: "#ffffff" },
                  },
                  tooltip: {
                    trigger: "hover",
                    content: () => <div className="text-sm font-medium">{node.name}</div>,
                  },
                }),
              ]}
            />
          </DetailMap>
        </DetailSection>
      )}
      {/* 04 · Linked Power Plant */}
      {node.eiaPlantCode && (
        <DetailSection id="linked-plant" kicker={`${nextNum()} · Generation`} title="Linked Power Plant">
          <DetailRelationships
            items={[{ label: "EIA Plant Code", name: node.eiaPlantCode, href: `/power-plants/${node.eiaPlantCode}` }]}
          />
        </DetailSection>
      )}

      {/* 05 · Nearby Nodes */}
      {!nodesLoading && nearbyNodes.length > 0 && (
        <DetailSection id="nearby" kicker={`${nextNum()} · Nearby`} title="Nearby Pricing Nodes">
          <DetailEntityList
            items={nearbyNodes.map((n) => ({
              href: `/pricing-nodes/${n.slug}`,
              name: n.name,
              dotColor: getIsoColor(n.iso),
              badge: (
                <Badge size="sm" shape="pill" variant="neutral">
                  {NODE_TYPE_LABELS[n.nodeType]}
                </Badge>
              ),
              meta: n.zone ?? undefined,
            }))}
            headerMeta={`${nearbyNodes.length} nodes in ${ISO_LABELS[node.iso]}`}
          />
        </DetailSection>
      )}
    </DetailPageShell>
  );
}
