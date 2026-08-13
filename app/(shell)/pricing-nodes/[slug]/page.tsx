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
import { usePowerPlant } from "@/hooks/usePowerPlant";
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

  // Resolve the linked generator. `eia_plant_code` is EIA's identifier, but
  // power plant pages are addressed by slug, so we have to resolve the code
  // to the real plant before we can link to it (a raw
  // `/power-plants/<eia_plant_code>` href used to 404). The detail endpoint
  // accepts either identifier, so passing the code straight through gives us
  // the canonical slug plus the plant's name for the card label.
  const { powerPlant: linkedPlant } = usePowerPlant(node?.eiaPlantCode);

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
    { id: "iso", label: "ISO/RTO", value: ISO_FULL_NAMES[node.iso], editable: false },
    {
      id: "nodeType",
      label: "Node Type",
      value: <Badge variant="neutral">{NODE_TYPE_LABELS[node.nodeType]}</Badge>,
      editable: true,
      fieldName: "node_type",
    },
    { id: "zone", label: "Zone", value: node.zone ?? null, editable: true, fieldName: "zone" },
    { id: "state", label: "State", value: node.state ?? null, editable: true, fieldName: "state" },
    { id: "source", label: "Data Source", value: node.source, editable: false },
    { id: "nodeId", label: "Node ID", value: node.id, copyable: true, editable: false },
  ];

  // Location fields
  const locationFields = [
    { id: "latitude", label: "Latitude", value: node.latitude.toFixed(4), editable: true, fieldName: "latitude" },
    { id: "longitude", label: "Longitude", value: node.longitude.toFixed(4), editable: true, fieldName: "longitude" },
    ...(node.voltageKv
      ? [{ id: "voltage", label: "Voltage", value: `${node.voltageKv} kV`, editable: true, fieldName: "voltage_kv" }]
      : []),
    ...(node.eiaPlantCode
      ? [
          {
            id: "eiaPlantCode",
            label: "EIA Plant Code",
            value: node.eiaPlantCode,
            ...(linkedPlant ? { href: `/power-plants/${linkedPlant.slug}` } : {}),
            editable: false,
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
          <FieldList
            items={overviewFields}
            columns={2}
            enableInlineEdit
            entityType="pricing_node"
            entityId={node.id ?? node.slug}
            entityName={node.name}
            currentValues={node as unknown as Record<string, unknown>}
            onFieldEdited={() => {
              window.location.reload();
            }}
          />
        </EntitySection>

        {/* Location Details */}
        <EntitySection id="location-details" title="Location Details">
          <FieldList
            items={locationFields}
            columns={2}
            enableInlineEdit
            entityType="pricing_node"
            entityId={node.id ?? node.slug}
            entityName={node.name}
            currentValues={node as unknown as Record<string, unknown>}
            onFieldEdited={() => {
              window.location.reload();
            }}
          />
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
              items={[
                {
                  label: "Power Plant",
                  // Show the plant's name once resolved; fall back to the raw
                  // EIA code while the lookup is in flight or if the code
                  // doesn't match a live plant.
                  name: linkedPlant ? linkedPlant.name : node.eiaPlantCode,
                  meta: linkedPlant ? `EIA Plant Code ${linkedPlant.plantCode}` : `EIA Plant Code ${node.eiaPlantCode}`,
                  ...(linkedPlant ? { href: `/power-plants/${linkedPlant.slug}` } : {}),
                },
              ]}
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
