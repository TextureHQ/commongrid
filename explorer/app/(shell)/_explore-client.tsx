"use client";

import { InteractiveMap, type LayerFeature, layer } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { getSegmentLabel } from "@/lib/formatting";

function getTileUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/tiles/territories/{z}/{x}/{y}?v=3`;
  }
  return "/api/tiles/territories/{z}/{x}/{y}?v=3";
}

const segmentColorMapping = {
  INVESTOR_OWNED_UTILITY: { hex: "#3b82f6" },
  DISTRIBUTION_COOPERATIVE: { hex: "#f59e0b" },
  MUNICIPAL_UTILITY: { hex: "#10b981" },
  COMMUNITY_CHOICE_AGGREGATOR: { hex: "#8b5cf6" },
  GENERATION_AND_TRANSMISSION: { hex: "#6b7280" },
  POLITICAL_SUBDIVISION: { hex: "#14b8a6" },
  TRANSMISSION_OPERATOR: { hex: "#64748b" },
  JOINT_ACTION_AGENCY: { hex: "#a855f7" },
  FEDERAL: { hex: "#ef4444" },
  UNKNOWN: { hex: "#9ca3af" },
};

interface ExplorePageClientProps {
  mapboxAccessToken?: string;
}

export function ExplorePageClient({ mapboxAccessToken }: ExplorePageClientProps) {
  const router = useRouter();

  const handleClick = useCallback(
    (feature: LayerFeature) => {
      const slug = feature.properties.slug;
      if (slug && slug !== "UNKNOWN") {
        router.push(`/utilities/${slug}`);
      }
    },
    [router]
  );

  return (
    <div className="h-full w-full">
      <InteractiveMap
        {...(mapboxAccessToken && { mapboxAccessToken })}
        initialViewState={{
          longitude: -98.58,
          latitude: 39.83,
          zoom: 4,
        }}
        mapType="neutral"
        controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
        layers={[
          layer.vector({
            id: "territories",
            tileset: getTileUrl(),
            sourceLayer: "territories",
            renderAs: "fill",
            style: {
              color: { by: "segment", mapping: segmentColorMapping },
              fillOpacity: 0.3,
              borderWidth: 1,
              borderColor: { by: "segment", mapping: segmentColorMapping },
            },
            tooltip: {
              trigger: "hover",
              content: (feature: LayerFeature) => (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm">{feature.properties.name}</span>
                  <span className="text-xs text-gray-500">{getSegmentLabel(feature.properties.segment)}</span>
                </div>
              ),
            },
            events: {
              onClick: handleClick,
            },
          }),
        ]}
      />
    </div>
  );
}
