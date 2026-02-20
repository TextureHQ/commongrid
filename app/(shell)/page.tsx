"use client";

import { InteractiveMap, type LayerFeature, layer, Badge, Card } from "@texturehq/edges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId } from "react";
import { getSegmentLabel } from "@/lib/formatting";

function getTileUrl() {
  return "/tiles/{z}/{x}/{y}.pbf";
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

const hasMapboxToken = !!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

function MapFallbackHero() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background-surface">
      <div className="max-w-2xl mx-auto px-6 py-8 sm:py-16 text-center">
        <div className="mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" className="h-16 w-16 mx-auto text-text-heading opacity-80">
            <circle cx="10" cy="10" r="3.5"/><circle cx="25" cy="10" r="3.5"/><circle cx="40" cy="10" r="3.5"/><circle cx="55" cy="10" r="3.5"/><circle cx="70" cy="10" r="3.5"/><circle cx="85" cy="10" r="3.5"/>
            <circle cx="10" cy="90" r="3.5"/><circle cx="25" cy="90" r="3.5"/><circle cx="40" cy="90" r="3.5"/><circle cx="55" cy="90" r="3.5"/><circle cx="70" cy="90" r="3.5"/><circle cx="85" cy="90" r="3.5"/>
            <circle cx="10" cy="26" r="3.5"/><circle cx="10" cy="42" r="3.5"/><circle cx="10" cy="58" r="3.5"/><circle cx="10" cy="74" r="3.5"/>
            <circle cx="85" cy="26" r="3.5"/><circle cx="85" cy="42" r="3.5"/><circle cx="85" cy="58" r="3.5"/><circle cx="85" cy="74" r="3.5"/>
            <rect x="28" y="28" width="8" height="44" rx="2"/><rect x="28" y="64" width="30" height="8" rx="2"/><rect x="58" y="28" width="8" height="44" rx="2"/><rect x="44" y="28" width="22" height="8" rx="2"/>
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-text-heading mb-4 tracking-tight">
          OpenGrid Explorer
        </h1>
        <p className="text-base sm:text-lg text-text-muted mb-8 leading-relaxed">
          The open-source energy infrastructure dataset. Browse 3,000+ utility territories,
          grid operators, and energy data across the United States.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <Link
            href="/utilities"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            ⚡ Browse Utilities
          </Link>
          <Link
            href="/grid-operators"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border-default text-text-body font-medium text-sm hover:bg-background-surface-hover transition-colors"
          >
            🔌 Grid Operators
          </Link>
          <Link
            href="/about"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border-default text-text-body font-medium text-sm hover:bg-background-surface-hover transition-colors"
          >
            About OpenGrid
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Utilities", value: "3,132", icon: "⚡" },
            { label: "Territories", value: "3,000+", icon: "🗺️" },
            { label: "ISOs & RTOs", value: "7+", icon: "🔌" },
            { label: "Data Sources", value: "5+", icon: "📦" },
          ].map((stat) => (
            <Card key={stat.label} variant="outlined">
              <Card.Content className="text-center py-3">
                <div className="text-xl mb-1">{stat.icon}</div>
                <div className="text-lg font-semibold text-text-heading">{stat.value}</div>
                <div className="text-xs text-text-muted">{stat.label}</div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const mapKey = useId();

  const handleClick = useCallback(
    (feature: LayerFeature) => {
      const slug = feature.properties.slug;
      if (slug && slug !== "UNKNOWN") {
        router.push(`/utilities/${slug}`);
      }
    },
    [router]
  );

  if (!hasMapboxToken) {
    return <MapFallbackHero />;
  }

  return (
    <div className="h-full w-full" key={mapKey}>
      <InteractiveMap
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!}
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
