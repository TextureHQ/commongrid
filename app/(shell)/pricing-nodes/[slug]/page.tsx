"use client";

import { Badge, InteractiveMap, Loader, layer } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import {
  EntityList,
  EntityMap,
  EntityPageHeader,
  EntitySection,
  type EntityStat,
  EntityStatsRow,
  FieldList,
  RelationshipCards,
} from "@/components/entity";
import { usePricingNode } from "@/hooks/usePricingNode";
import { usePricingNodeList } from "@/hooks/usePricingNodeList";
import { getIsoColor, ISO_FULL_NAMES, ISO_LABELS, NODE_TYPE_LABELS } from "@/types/pricing-nodes";

export default function PricingNodeDetailPage() {
  const params = useParams<{ slug: string }>();
  const { pricingNode: node, isLoading } = usePricingNode(params.slug);

  // Load nodes from the same ISO for "nearby" calculation
  const { pricingNodes: sameIsoNodes, isLoading: nodesLoading } = usePricingNodeList({
    iso: node?.iso,
    limit: 200,
  });

  const nearbyNodes = useMemo(() => {
    if (!node || sameIsoNodes.length === 0) return [];
    return sameIsoNodes
      .filter((n) => n.slug !== node.slug)
      .filter((n) => {
        const dLat = Math.abs(n.latitude - node.latitude);
        const dLon = Math.abs(n.longitude - node.longitude);
        return dLat < 1 && dLon < 1; // roughly within ~70 miles
      })
      .slice(0, 10);
  }, [node, sameIsoNodes]);

  if (isLoading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-center py-24">
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

  // Header stats band — these are categorical strings, so the back-compat
  // pre-formatted shape is the right fit (no numeric formatter needed).
  const headerStats: EntityStat[] = [
    { value: ISO_LABELS[node.iso], label: "ISO/RTO" },
    { value: NODE_TYPE_LABELS[node.nodeType], label: "Node Type" },
    ...(node.zone ? [{ value: node.zone, label: "Zone" }] : []),
    ...(node.state ? [{ value: node.state, label: "State" }] : []),
  ];

  // Overview fields
  const overviewFields = [
    { id: "iso", label: "ISO/RTO", value: ISO_FULL_NAMES[node.iso] },
    {
      id: "nodeType",
      label: "Node Type",
      value: <Badge variant="neutral">{NODE_TYPE_LABELS[node.nodeType]}</Badge>,
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

  return (
    <>
      <EntityPageHeader
        entityName={node.name}
        subtitle={
          <>
            <span>{ISO_LABELS[node.iso]}</span>
            <span className="text-text-muted mx-2">·</span>
            <Badge variant="neutral">{NODE_TYPE_LABELS[node.nodeType]}</Badge>
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
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        {/* Key stats band */}
        <EntityStatsRow stats={headerStats} />

        {/* Overview */}
        <EntitySection id="overview" title="Overview">
          <FieldList items={overviewFields} columns={2} />
        </EntitySection>

        {/* Location Details */}
        <EntitySection id="location-details" title="Location Details">
          <FieldList items={locationFields} columns={2} />
        </EntitySection>

        {/* Map */}
        {process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && (
          <EntitySection id="map" title="Map">
            <EntityMap>
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
            </EntityMap>
          </EntitySection>
        )}

        {/* Linked Power Plant */}
        {node.eiaPlantCode && (
          <EntitySection id="linked-plant" title="Linked Power Plant">
            <RelationshipCards
              items={[{ label: "EIA Plant Code", name: node.eiaPlantCode, href: `/power-plants/${node.eiaPlantCode}` }]}
            />
          </EntitySection>
        )}

        {/* Nearby Nodes */}
        {!nodesLoading && nearbyNodes.length > 0 && (
          <EntitySection id="nearby" title="Nearby Pricing Nodes">
            <EntityList
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
          </EntitySection>
        )}
      </div>
    </>
  );
}
