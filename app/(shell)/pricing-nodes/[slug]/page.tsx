"use client";

import {
  Badge,
  Card,
  InteractiveMap,
  layer,
  Loader,
  PageLayout,
  Section,
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
      <PageLayout>
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

  return (
    <PageLayout>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">ISO/RTO</div>
                  <div className="font-medium">{ISO_FULL_NAMES[node.iso]}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Node Type</div>
                  <Badge size="sm" shape="pill" variant={getNodeTypeBadgeVariant(node.nodeType)}>
                    {NODE_TYPE_LABELS[node.nodeType]}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Zone</div>
                  <div className="font-medium">{node.zone ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">State</div>
                  <div className="font-medium">{node.state ?? "—"}</div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Location Details */}
        <Section id="location" navLabel="Location" title="Location" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Latitude</div>
                  <div className="font-medium font-mono text-sm">{node.latitude.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Longitude</div>
                  <div className="font-medium font-mono text-sm">{node.longitude.toFixed(4)}</div>
                </div>
                {node.voltageKv && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">Voltage</div>
                    <div className="font-medium">{node.voltageKv} kV</div>
                  </div>
                )}
                {node.eiaPlantCode && (
                  <div>
                    <div className="text-sm text-text-muted mb-1">EIA Plant Code</div>
                    <div className="font-medium font-mono text-sm">
                      <Link
                        href={`/power-plants/${node.eiaPlantCode}`}
                        className="text-brand-primary hover:underline"
                      >
                        {node.eiaPlantCode}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-text-muted mb-1">Data Source</div>
                  <div className="font-medium">{node.source}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Node ID</div>
                  <div className="font-medium font-mono text-sm">{node.id}</div>
                </div>
              </div>
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
