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
import { usePricingNode } from "@/lib/pricing-nodes";
import {
  type IsoRto,
  type PricingNodeType,
  ISO_LABELS,
  ISO_FULL_NAMES,
  NODE_TYPE_LABELS,
  getIsoColor,
} from "@/types/pricing-nodes";

function getNodeTypeBadgeVariant(type: PricingNodeType): "success" | "info" | "warning" | "neutral" {
  switch (type) {
    case "hub": return "warning";
    case "zone": return "info";
    case "sublap": return "info";
    case "lap": return "info";
    case "gen": return "success";
    case "load": return "neutral";
    case "interface": return "neutral";
    default: return "neutral";
  }
}

export default function PricingNodeDetailPage() {
  const params = useParams<{ slug: string }>();
  const { node, isLoading } = usePricingNode(params.slug);

  if (isLoading) {
    return (
      <PageLayout maxWidth={896}>
        <PageLayout.Header
          title="Pricing Node"
          breadcrumbs={[{ label: "Pricing Nodes", href: "/pricing-nodes" }]}
        />
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
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

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const overviewItems: StatItem[] = [
    { id: "iso", label: "ISO/RTO", value: ISO_FULL_NAMES[node.iso] },
    {
      id: "nodeType",
      label: "Node Type",
      value: (
        <Badge size="sm" shape="pill" variant={getNodeTypeBadgeVariant(node.nodeType)}>
          {NODE_TYPE_LABELS[node.nodeType]}
        </Badge>
      ),
    },
    { id: "zone", label: "Zone", value: node.zone ?? null },
    { id: "state", label: "State", value: node.state ?? null },
  ];

  const locationItems: StatItem[] = [
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
    { id: "source", label: "Data Source", value: node.source },
    { id: "nodeId", label: "Node ID", value: node.id, copyable: true },
  ];

  return (
    <PageLayout maxWidth={896}>
      <PageLayout.Header
        title={node.name}
        breadcrumbs={[
          { label: "Pricing Nodes", href: "/pricing-nodes" },
          { label: node.slug, copyable: true, copyValue: node.slug },
        ]}
      />
      <DataSourceLink paths={["data/pricing-nodes.json"]} className="px-4 sm:px-6 pb-2" />
      <PageLayout.Content>
        {/* Overview */}
        <Section id="overview" navLabel="Overview" title="Overview" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isoColor }}
                />
                <div>
                  <div className="text-lg font-semibold">{node.name}</div>
                  <div className="text-sm text-text-muted">
                    {ISO_LABELS[node.iso]} · {NODE_TYPE_LABELS[node.nodeType]}
                  </div>
                </div>
              </div>
              <StatList layout="two-column" showDividers items={overviewItems} />
            </Card.Content>
          </Card>
        </Section>

        {/* Location Details */}
        <Section id="location" navLabel="Location" title="Location" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <StatList layout="two-column" showDividers items={locationItems} />
            </Card.Content>
          </Card>
        </Section>

        {/* Map */}
        {mapboxToken && (
          <Section id="map" navLabel="Map" title="Map" withDivider>
            <Card variant="outlined">
              <Card.Content className="p-0 overflow-hidden rounded-lg">
                <div style={{ height: 400 }}>
                  <InteractiveMap
                    mapboxAccessToken={mapboxToken}
                    initialViewState={{
                      longitude: node.longitude,
                      latitude: node.latitude,
                      zoom: node.nodeType === "zone" || node.nodeType === "hub" ? 6 : 10,
                    }}
                    mapType="neutral"
                    controls={[{ type: "navigation", position: "bottom-right" }]}
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
                          content: () => (
                            <div className="text-sm font-medium">{node.name}</div>
                          ),
                        },
                      }),
                    ]}
                  />
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
