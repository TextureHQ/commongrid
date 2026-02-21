"use client";

import { InteractiveMap, type LayerFeature, type LayerSpec, layer } from "@texturehq/edges";
import type { FeatureCollection, Feature } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExplorer } from "./ExplorerContext";
import { getAllIsos, getAllBalancingAuthorities, getAllUtilities, searchEntities } from "@/lib/data";
import { getSegmentLabel } from "@/lib/formatting";
import { computeViewStateFromGeoJSON } from "@/lib/geo";

function getTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/tiles/{z}/{x}/{y}.pbf`;
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

const US_CENTER = { longitude: -98.58, latitude: 39.83, zoom: 4 };

// hasMapboxToken is evaluated per-render based on the prop (see ExplorerMap component)

// Distinct, high-contrast colors for operator boundaries
const OPERATOR_PALETTE = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#e11d48", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0d9488", "#ea580c", "#4f46e5", "#65a30d",
  "#0891b2", "#be123c", "#047857", "#b45309", "#6d28d9",
  "#a21caf", "#0f766e", "#c2410c", "#4338ca", "#4d7c0f",
  "#0e7490", "#9f1239", "#15803d", "#92400e", "#5b21b6",
  "#86198f", "#115e59", "#9a3412", "#3730a3", "#3f6212",
  "#155e75", "#881337", "#166534", "#78350f", "#4c1d95",
];

interface GridBoundaryData {
  geojson: FeatureCollection;
  colorMapping: Record<string, { hex: string }>;
}

function useGridOperatorBoundaries(isActive: boolean) {
  const [data, setData] = useState<GridBoundaryData | null>(null);

  useEffect(() => {
    if (!isActive) {
      setData(null);
      return;
    }

    let cancelled = false;

    async function load() {
      const isos = getAllIsos();
      const bas = getAllBalancingAuthorities();

      let colorIdx = 0;
      const colorMapping: Record<string, { hex: string }> = {};

      const isoFiles = isos
        .filter((iso) => iso.shortName)
        .map((iso) => {
          const colorKey = `iso-${iso.shortName.toLowerCase()}`;
          colorMapping[colorKey] = { hex: OPERATOR_PALETTE[colorIdx % OPERATOR_PALETTE.length] };
          colorIdx++;
          return { key: `iso-${iso.shortName.toLowerCase()}`, name: iso.shortName, type: "ISO", colorKey };
        });

      const baFiles = bas
        .filter((ba) => ba.regionId)
        .map((ba) => {
          const colorKey = `ba-${ba.slug}`;
          colorMapping[colorKey] = { hex: OPERATOR_PALETTE[colorIdx % OPERATOR_PALETTE.length] };
          colorIdx++;
          return { key: `ba-${ba.slug}`, name: ba.shortName, type: "BA", colorKey };
        });

      const allFiles = [...isoFiles, ...baFiles];
      const allFeatures: Feature[] = [];

      const results = await Promise.allSettled(
        allFiles.map(async (entry) => {
          const res = await fetch(`/data/territories/${entry.key}.json`);
          if (!res.ok) return null;
          const geojson = (await res.json()) as FeatureCollection;
          return { geojson, ...entry };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const { geojson, name, type, colorKey } = result.value;
        for (const feature of geojson.features) {
          allFeatures.push({
            ...feature,
            properties: {
              ...feature.properties,
              operatorName: name,
              operatorType: type,
              colorKey,
            },
          });
        }
      }

      if (!cancelled) {
        setData({
          geojson: { type: "FeatureCollection", features: allFeatures },
          colorMapping,
        });
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isActive]);

  return data;
}

interface ExplorerMapProps {
  mapboxAccessToken?: string;
}

export function ExplorerMap({ mapboxAccessToken }: ExplorerMapProps = {}) {
  const effectiveToken = mapboxAccessToken ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasMapboxToken = !!effectiveToken;
  const { state, navigateToDetail } = useExplorer();
  const mapRef = useRef<{ getMap: () => mapboxgl.Map | null } | null>(null);

  const isGridOperatorView = state.view === "grid-operators" || state.view === "iso" || state.view === "rto" || state.view === "ba";
  const gridBoundaryData = useGridOperatorBoundaries(isGridOperatorView);

  const handleClick = useCallback(
    (feature: LayerFeature) => {
      const slug = feature.properties.slug;
      if (slug && slug !== "UNKNOWN") {
        navigateToDetail("utility", slug);
      }
    },
    [navigateToDetail]
  );

  const hasHighlight = !!state.highlightGeoJSON;

  // Trigger map resize after mount (fixes blank map on client-side navigation)
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.getMap?.()?.resize();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Build Mapbox filter expression for utility territory tiles
  const territoryFilter = useMemo(() => {
    const conditions: any[] = [];

    if (state.segment && state.segment !== "all") {
      conditions.push(["==", ["get", "segment"], state.segment]);
    }

    if (state.q) {
      const allUtils = getAllUtilities();
      const matching = searchEntities(allUtils, state.q);
      const slugs = matching.map((u) => u.slug);
      if (slugs.length > 0) {
        conditions.push(["in", ["get", "slug"], ["literal", slugs]]);
      } else {
        // No matches — hide everything
        conditions.push(["==", ["get", "slug"], "__no_match__"]);
      }
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return ["all", ...conditions];
  }, [state.segment, state.q]);

  // Filter grid operator GeoJSON by type and search
  const filteredGridBoundaryData = useMemo(() => {
    if (!gridBoundaryData) return null;

    const hasTypeFilter = state.type && state.type !== "all";
    const hasSearch = !!state.q;

    if (!hasTypeFilter && !hasSearch) return gridBoundaryData;

    const filteredFeatures = gridBoundaryData.geojson.features.filter((f) => {
      const props = f.properties ?? {};
      if (hasTypeFilter && props.operatorType !== state.type) return false;
      if (hasSearch) {
        const name = (props.operatorName ?? "").toLowerCase();
        const q = state.q.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    return {
      geojson: { type: "FeatureCollection" as const, features: filteredFeatures },
      colorMapping: gridBoundaryData.colorMapping,
    };
  }, [gridBoundaryData, state.type, state.q]);

  // FlyTo when highlight GeoJSON changes (entity selected), reset on back
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    if (state.highlightGeoJSON) {
      const viewState = computeViewStateFromGeoJSON(state.highlightGeoJSON);
      if (viewState) {
        map.flyTo({
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          duration: 1200,
        });
      }
    } else if ((!state.segment || state.segment === "all") && !state.q) {
      // No highlight and no filter = reset to US overview
      map.flyTo({
        center: [US_CENTER.longitude, US_CENTER.latitude],
        zoom: US_CENTER.zoom,
        duration: 1200,
      });
    }
  }, [state.highlightGeoJSON, state.segment, state.q]);

  // Fit map bounds when filters change (utility territories)
  const hasActiveFilter = !isGridOperatorView && !hasHighlight && !!((state.segment && state.segment !== "all") || state.q);

  useEffect(() => {
    if (!hasActiveFilter) return;

    const map = mapRef.current?.getMap?.();
    if (!map) return;

    function fitToFilteredFeatures() {
      const m = mapRef.current?.getMap?.();
      if (!m) return;

      const features = m.querySourceFeatures("territories-source", {
        sourceLayer: "territories",
      });

      // Apply our filter client-side since querySourceFeatures filter may not match expression syntax
      const filtered = features.filter((f) => {
        const props = f.properties ?? {};
        if (state.segment && state.segment !== "all" && props.segment !== state.segment) return false;
        if (state.q) {
          const name = (props.name ?? "").toLowerCase();
          const slug = (props.slug ?? "").toLowerCase();
          const q = state.q.toLowerCase();
          if (!name.includes(q) && !slug.includes(q)) return false;
        }
        return true;
      });

      if (filtered.length === 0) return;

      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      for (const f of filtered) {
        if (!f.geometry || !("coordinates" in f.geometry)) continue;
        const processCoords = (coords: any) => {
          if (!Array.isArray(coords)) return;
          if (typeof coords[0] === "number" && typeof coords[1] === "number") {
            if (coords[0] < minLng) minLng = coords[0];
            if (coords[0] > maxLng) maxLng = coords[0];
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
          } else {
            for (const c of coords) processCoords(c);
          }
        };
        processCoords((f.geometry as any).coordinates);
      }

      if (minLng < maxLng && minLat < maxLat) {
        m.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 50, duration: 1200, maxZoom: 10 }
        );
      }
    }

    // Initial attempt after filter applies
    const timeoutId = setTimeout(fitToFilteredFeatures, 500);

    return () => clearTimeout(timeoutId);
  }, [hasActiveFilter, state.segment, state.q]);

  // Fit map bounds when grid operator filters change
  useEffect(() => {
    if (!isGridOperatorView || hasHighlight || !filteredGridBoundaryData) return;

    const hasFilter = (state.type && state.type !== "all") || state.q;
    if (!hasFilter) {
      const map = mapRef.current?.getMap?.();
      if (map) {
        map.flyTo({
          center: [US_CENTER.longitude, US_CENTER.latitude],
          zoom: US_CENTER.zoom,
          duration: 1200,
        });
      }
      return;
    }

    const viewState = computeViewStateFromGeoJSON(filteredGridBoundaryData.geojson);
    if (!viewState) return;

    const map = mapRef.current?.getMap?.();
    if (!map) return;

    map.flyTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      duration: 1200,
    });
  }, [state.type, state.q, isGridOperatorView, hasHighlight, filteredGridBoundaryData]);

  const layers = useMemo(() => {
    const result: LayerSpec[] = [];

    if (!isGridOperatorView && !hasHighlight) {
      // Utility territory tiles (hidden when a specific entity is selected)
      result.push(
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
          ...(territoryFilter ? { filter: territoryFilter } : {}),
        })
      );
    } else if (filteredGridBoundaryData && !hasHighlight) {
      // Grid operator boundaries (hidden when a specific entity is selected)
      result.push(
        layer.geojson({
          id: "grid-boundaries",
          data: filteredGridBoundaryData.geojson,
          renderAs: "fill",
          style: {
            color: { by: "colorKey", mapping: filteredGridBoundaryData.colorMapping },
            fillOpacity: 0.18,
            borderWidth: 2,
            borderColor: { by: "colorKey", mapping: filteredGridBoundaryData.colorMapping },
          },
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{feature.properties.operatorName}</span>
                <span className="text-xs text-gray-500">{feature.properties.operatorType}</span>
              </div>
            ),
          },
        })
      );
    }

    // Highlight layer for selected entity
    if (state.highlightGeoJSON) {
      result.push(
        layer.geojson({
          id: "highlight",
          data: state.highlightGeoJSON,
          renderAs: "fill",
          style: {
            color: { token: "brand-primary" },
            fillOpacity: 0.25,
            borderWidth: 3,
            borderColor: { token: "brand-primary" },
          },
        })
      );
    }

    return result;
  }, [handleClick, state.highlightGeoJSON, isGridOperatorView, filteredGridBoundaryData, hasHighlight, territoryFilter]);

  if (!hasMapboxToken) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background-surface">
        <div className="text-center px-6">
          <div className="text-lg font-semibold text-text-heading mb-2">Map Unavailable</div>
          <p className="text-sm text-text-muted">Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <InteractiveMap
        ref={mapRef as React.Ref<any>}
        mapboxAccessToken={effectiveToken!}
        initialViewState={US_CENTER}
        mapType="neutral"
        controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
        layers={layers}
      />
    </div>
  );
}
