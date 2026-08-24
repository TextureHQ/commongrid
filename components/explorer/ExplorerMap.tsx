"use client";

import { InteractiveMap, type LayerFeature, type LayerSpec, layer } from "@texturehq/edges";
import type { Feature, FeatureCollection } from "geojson";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  evNetworkColor,
  fuelColor,
  isoColor,
  operatorColor,
  utilityColor,
  voltageColor,
} from "@/lib/categorical-colors";
import { getAllBalancingAuthorities, getAllIsos, getAllPrograms, getRegionById } from "@/lib/data";
import { computeViewStateFromGeoJSON } from "@/lib/geo";
import { resolveColorMapping, resolveCSSColor } from "@/lib/resolve-css-colors";
import { useExplorer } from "./ExplorerContext";
import {
  EVChargingTooltip,
  GridOperatorTooltip,
  PowerPlantTooltip,
  PricingNodeTooltip,
  ProgramTerritoryTooltip,
  SubstationTooltip,
  TerritoryTooltip,
  TransmissionTooltip,
} from "./MapTooltip";

function getTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/territories/{z}/{x}/{y}`;
}

const segmentColorMapping = {
  INVESTOR_OWNED_UTILITY: { hex: utilityColor("INVESTOR_OWNED_UTILITY") },
  DISTRIBUTION_COOPERATIVE: { hex: utilityColor("DISTRIBUTION_COOPERATIVE") },
  MUNICIPAL_UTILITY: { hex: utilityColor("MUNICIPAL_UTILITY") },
  COMMUNITY_CHOICE_AGGREGATOR: { hex: utilityColor("COMMUNITY_CHOICE_AGGREGATOR") },
  GENERATION_AND_TRANSMISSION: { hex: utilityColor("GENERATION_AND_TRANSMISSION") },
  POLITICAL_SUBDIVISION: { hex: utilityColor("POLITICAL_SUBDIVISION") },
  TRANSMISSION_OPERATOR: { hex: utilityColor("TRANSMISSION_OPERATOR") },
  JOINT_ACTION_AGENCY: { hex: utilityColor("JOINT_ACTION_AGENCY") },
  FEDERAL: { hex: utilityColor("FEDERAL") },
  UNKNOWN: { hex: utilityColor(null) },
};

const US_CENTER = { longitude: -98.58, latitude: 39.83, zoom: 4 };

function getPowerPlantTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/power-plants/{z}/{x}/{y}`;
}

function getTransmissionTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/transmission-lines/{z}/{x}/{y}`;
}

function getEvChargingTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/ev-charging/{z}/{x}/{y}`;
}

function getPricingNodesTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/pricing-nodes/{z}/{x}/{y}`;
}

function getSubstationsTileUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/tiles/substations/{z}/{x}/{y}`;
}

// Pricing node ISO color mapping
const pricingNodeIsoColorMapping: Record<string, { hex: string }> = {
  CAISO: { hex: isoColor("caiso") },
  PJM: { hex: isoColor("pjm") },
  ERCOT: { hex: isoColor("ercot") },
  MISO: { hex: isoColor("miso") },
  NYISO: { hex: isoColor("nyiso") },
  ISONE: { hex: isoColor("isone") },
  SPP: { hex: isoColor("spp") },
};

// Color by voltage class
const voltageClassColorMapping = {
  "extra-high": { hex: voltageColor("extra-high") }, // 345kV+
  high: { hex: voltageColor("high") }, // 230–344kV
  medium: { hex: voltageColor("medium") }, // 115–229kV
  "sub-trans": { hex: voltageColor("subtrans") }, // 69–114kV
  unknown: { hex: voltageColor("unknown") },
};

// Substations share the voltage class palette (voltageBand uses the same buckets).
const substationVoltageBandColorMapping = {
  "extra-high": { hex: voltageColor("extra-high") },
  high: { hex: voltageColor("high") },
  medium: { hex: voltageColor("medium") },
  "sub-trans": { hex: voltageColor("subtrans") },
  unknown: { hex: voltageColor("unknown") },
};

const fuelCategoryColorMapping = {
  Solar: { hex: fuelColor("solar") },
  "Natural Gas": { hex: fuelColor("gas") },
  Hydro: { hex: fuelColor("hydro") },
  Wind: { hex: fuelColor("wind") },
  Coal: { hex: fuelColor("coal") },
  Nuclear: { hex: fuelColor("nuclear") },
  "Battery Storage": { hex: fuelColor("battery") },
  Petroleum: { hex: fuelColor("petroleum") },
  "Biomass/Other": { hex: fuelColor("biomass") },
};

// EV network color mapping (top networks get distinct colors, rest gray)
const evNetworkColorMapping: Record<string, { hex: string }> = {
  Tesla: { hex: evNetworkColor("tesla") },
  "ChargePoint Network": { hex: evNetworkColor("chargepoint") },
  "Electrify America": { hex: evNetworkColor("electrify") },
  "EVgo Network": { hex: evNetworkColor("evgo") },
  "Blink Network": { hex: evNetworkColor("blink") },
  "Non-Networked": { hex: evNetworkColor("nonnetworked") },
};

// Highlight color for selected entity
const HIGHLIGHT_COLOR = "var(--color-ocean-base)";

// hasMapboxToken is evaluated per-render based on the prop (see ExplorerMap component)

// Distinct, high-contrast colors for operator boundaries — 12 unique
// hues from the Edges curated viz-categorical palette, cycled by
// `operatorColor(index)`. With more operators than palette slots we
// accept some repetition; the assignment logic that drives `index`
// (see `getOperatorIndex` below) prioritizes giving adjacent boundary
// polygons different colors.
const OPERATOR_PALETTE: string[] = Array.from({ length: 12 }, (_, i) => operatorColor(i));

interface GridBoundaryData {
  geojson: FeatureCollection;
  colorMapping: Record<string, { hex: string }>;
}

function useGridOperatorBoundaries(isActive: boolean, operatorPalette: string[]) {
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
          colorMapping[colorKey] = { hex: operatorPalette[colorIdx % operatorPalette.length] };
          colorIdx++;
          return { key: `iso-${iso.shortName.toLowerCase()}`, name: iso.shortName, type: "ISO", colorKey };
        });

      const baFiles = bas
        .filter((ba) => ba.regionId)
        .map((ba) => {
          const colorKey = `ba-${ba.slug}`;
          colorMapping[colorKey] = { hex: operatorPalette[colorIdx % operatorPalette.length] };
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
    return () => {
      cancelled = true;
    };
  }, [isActive, operatorPalette]);

  return data;
}

interface ProgramBoundaryData {
  geojson: FeatureCollection;
  colorMapping: Record<string, { hex: string }>;
}

function useProgramBoundaries(isActive: boolean, operatorPalette: string[]) {
  const [data, setData] = useState<ProgramBoundaryData | null>(null);

  useEffect(() => {
    if (!isActive) {
      setData(null);
      return;
    }

    let cancelled = false;

    async function load() {
      const programs = getAllPrograms();

      let colorIdx = 0;
      const colorMapping: Record<string, { hex: string }> = {};

      // Map each program to its color and territory file keys
      const programEntries: {
        programSlug: string;
        programName: string;
        programStatus: string;
        colorKey: string;
        fileKeys: string[];
      }[] = [];
      const uniqueFileKeys = new Set<string>();

      for (const prog of programs) {
        const colorKey = `prog-${prog.slug}`;
        colorMapping[colorKey] = { hex: operatorPalette[colorIdx % operatorPalette.length] };
        colorIdx++;

        const fileKeys: string[] = [];
        for (const regionId of prog.regions) {
          const region = getRegionById(regionId);
          if (!region) continue;

          const fileKey =
            region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM"
              ? region.slug
              : region.eiaId;
          if (!fileKey) continue;
          fileKeys.push(fileKey);
          uniqueFileKeys.add(fileKey);
        }

        if (fileKeys.length > 0) {
          programEntries.push({
            programSlug: prog.slug,
            programName: prog.name,
            programStatus: prog.status,
            colorKey,
            fileKeys,
          });
        }
      }

      // Fetch each unique territory file once
      const territoryCache = new Map<string, FeatureCollection>();
      const results = await Promise.allSettled(
        [...uniqueFileKeys].map(async (key) => {
          const res = await fetch(`/data/territories/${key}.json`);
          if (!res.ok) return null;
          const geojson = (await res.json()) as FeatureCollection;
          return { key, geojson };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        territoryCache.set(result.value.key, result.value.geojson);
      }

      // Stamp features for every program (same territory can appear under multiple programs)
      const allFeatures: Feature[] = [];
      for (const entry of programEntries) {
        for (const fileKey of entry.fileKeys) {
          const geojson = territoryCache.get(fileKey);
          if (!geojson) continue;
          for (const feature of geojson.features) {
            allFeatures.push({
              ...feature,
              properties: {
                ...feature.properties,
                programName: entry.programName,
                programSlug: entry.programSlug,
                programStatus: entry.programStatus,
                colorKey: entry.colorKey,
              },
            });
          }
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
    return () => {
      cancelled = true;
    };
  }, [isActive, operatorPalette]);

  return data;
}

// Region = which fill/territory layer is shown on the map
export type MapRegion = "utilities" | "grid-operators" | "programs" | "rates" | "pricing-nodes";

// Overlay toggles for point/line layers
export interface MapOverlays {
  "power-plants": boolean;
  "transmission-lines": boolean;
  substations: boolean;
  "ev-charging": boolean;
  "pricing-nodes": boolean;
}

interface ExplorerMapProps {
  mapboxAccessToken?: string;
  mapRegion?: MapRegion;
  mapOverlays?: MapOverlays;
  onOverlayToggle?: (key: keyof MapOverlays) => void;
}

const DEFAULT_OVERLAYS: MapOverlays = {
  "power-plants": true,
  "transmission-lines": true,
  substations: false,
  "ev-charging": false,
  "pricing-nodes": false,
};

export function ExplorerMap({
  mapboxAccessToken,
  mapRegion = "utilities",
  mapOverlays,
  onOverlayToggle,
}: ExplorerMapProps = {}) {
  const effectiveToken = mapboxAccessToken ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasMapboxToken = !!effectiveToken;
  const { state, navigateToDetail } = useExplorer();
  const router = useRouter();
  const mapRef = useRef<{ getMap: () => mapboxgl.Map | null } | null>(null);
  const [mapType, setMapType] = useState<"streets" | "satellite" | "neutral">("neutral");

  // Resolved color mappings (CSS variables resolved to actual colors)
  const [resolvedSegmentColorMapping, setResolvedSegmentColorMapping] = useState(segmentColorMapping);
  const [resolvedPricingNodeIsoColorMapping, setResolvedPricingNodeIsoColorMapping] =
    useState(pricingNodeIsoColorMapping);
  const [resolvedVoltageClassColorMapping, setResolvedVoltageClassColorMapping] = useState(voltageClassColorMapping);
  const [resolvedSubstationVoltageBandColorMapping, setResolvedSubstationVoltageBandColorMapping] = useState(
    substationVoltageBandColorMapping
  );
  const [resolvedFuelCategoryColorMapping, setResolvedFuelCategoryColorMapping] = useState(fuelCategoryColorMapping);
  const [resolvedEvNetworkColorMapping, setResolvedEvNetworkColorMapping] = useState(evNetworkColorMapping);
  const [resolvedOperatorPalette, setResolvedOperatorPalette] = useState(OPERATOR_PALETTE);
  const [resolvedHighlightColor, setResolvedHighlightColor] = useState(HIGHLIGHT_COLOR);

  const overlays = mapOverlays ?? DEFAULT_OVERLAYS;

  // Resolve CSS variables to actual colors on mount (Mapbox can't parse CSS variables)
  useEffect(() => {
    setResolvedSegmentColorMapping(resolveColorMapping(segmentColorMapping));
    setResolvedPricingNodeIsoColorMapping(resolveColorMapping(pricingNodeIsoColorMapping));
    setResolvedVoltageClassColorMapping(resolveColorMapping(voltageClassColorMapping));
    setResolvedSubstationVoltageBandColorMapping(resolveColorMapping(substationVoltageBandColorMapping));
    setResolvedFuelCategoryColorMapping(resolveColorMapping(fuelCategoryColorMapping));
    setResolvedEvNetworkColorMapping(resolveColorMapping(evNetworkColorMapping));
    setResolvedOperatorPalette(OPERATOR_PALETTE.map(resolveCSSColor));
    setResolvedHighlightColor(resolveCSSColor(HIGHLIGHT_COLOR));
  }, []);

  // Derive layer visibility from overlays prop (for the Edges layers control)
  const layerVisibility: Record<string, boolean> = useMemo(
    () => ({
      "transmission-lines": overlays["transmission-lines"],
      "power-plants": overlays["power-plants"],
      substations: overlays.substations,
      "ev-charging": overlays["ev-charging"],
      "pricing-nodes": overlays["pricing-nodes"],
    }),
    [overlays]
  );

  const isGridOperatorView = mapRegion === "grid-operators";
  const isProgramView = mapRegion === "programs";
  const gridBoundaryData = useGridOperatorBoundaries(isGridOperatorView, resolvedOperatorPalette);
  const programBoundaryData = useProgramBoundaries(isProgramView, resolvedOperatorPalette);

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
  // AND wire a ResizeObserver on the map's container so the canvas re-fits
  // whenever the flex layout reshapes — ExplorePanel opening / closing /
  // expanding / drag-resizing all change the map column's width but
  // mapbox-gl doesn't observe its own container, so without this the
  // canvas keeps its old dimensions (visible as a blank stripe on
  // whichever edge was just freed up, or a stretched canvas overflowing
  // the new bounds).
  useEffect(() => {
    let observer: ResizeObserver | null = null;
    const timer = setTimeout(() => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;
      map.resize();
      const container = map.getContainer();
      if (container && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => map.resize());
        observer.observe(container);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  // Build Mapbox filter expression for utility territory tiles
  const territoryFilter = useMemo(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Mapbox GL filter expressions are untyped arrays
    const conditions: any[] = [];

    if (state.segment && state.segment !== "all") {
      conditions.push(["==", ["get", "segment"], state.segment]);
    }

    // When viewing programs with active filters, only show territories for matching utilities
    if (mapRegion === "programs" && state.filteredUtilitySlugs !== null) {
      conditions.push(["in", ["get", "slug"], ["literal", state.filteredUtilitySlugs]]);
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return ["all", ...conditions];
  }, [state.segment, mapRegion, state.filteredUtilitySlugs]);

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

  // Filter program GeoJSON by search and asset type
  const filteredProgramBoundaryData = useMemo(() => {
    if (!programBoundaryData) return null;

    const hasTypeFilter = state.type && state.type !== "all";
    const hasSearch = !!state.q;

    if (!hasTypeFilter && !hasSearch) return programBoundaryData;

    // Build a set of matching program slugs by running the same filter logic as ProgramListPanel
    const allPrograms = getAllPrograms();
    const matchingSlugs = new Set<string>();

    for (const prog of allPrograms) {
      if (hasTypeFilter && !(prog.assetTypes as string[]).includes(state.type)) continue;
      if (hasSearch) {
        const name = prog.name.toLowerCase();
        const slug = prog.slug.toLowerCase();
        const q = state.q.toLowerCase();
        if (!name.includes(q) && !slug.includes(q)) continue;
      }
      matchingSlugs.add(prog.slug);
    }

    const filteredFeatures = programBoundaryData.geojson.features.filter((f) => {
      const slug = f.properties?.programSlug;
      return slug && matchingSlugs.has(slug);
    });

    return {
      geojson: { type: "FeatureCollection" as const, features: filteredFeatures },
      colorMapping: programBoundaryData.colorMapping,
    };
  }, [programBoundaryData, state.type, state.q]);

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
  const hasActiveFilter =
    !isGridOperatorView && !isProgramView && !hasHighlight && !!((state.segment && state.segment !== "all") || state.q);

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

      let minLng = 180,
        maxLng = -180,
        minLat = 90,
        maxLat = -90;
      for (const f of filtered) {
        if (!f.geometry || !("coordinates" in f.geometry)) continue;
        // biome-ignore lint/suspicious/noExplicitAny: recursive GeoJSON coordinate traversal, nested array shape is unknown
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
        // biome-ignore lint/suspicious/noExplicitAny: cast to access .coordinates on narrowed GeoJSON geometry union
        processCoords((f.geometry as any).coordinates);
      }

      if (minLng < maxLng && minLat < maxLat) {
        m.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
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

  // Fit map bounds when program filters change
  useEffect(() => {
    if (!isProgramView || hasHighlight || !filteredProgramBoundaryData) return;

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

    const viewState = computeViewStateFromGeoJSON(filteredProgramBoundaryData.geojson);
    if (!viewState) return;

    const map = mapRef.current?.getMap?.();
    if (!map) return;

    map.flyTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      duration: 1200,
    });
  }, [state.type, state.q, isProgramView, hasHighlight, filteredProgramBoundaryData]);

  const layers = useMemo(() => {
    const visible = layerVisibility;
    const result: LayerSpec[] = [];

    if (!isGridOperatorView && !isProgramView && !hasHighlight) {
      // Utility territory tiles — single layer visible from zoom 0.
      // tippecanoe handles zoom-dependent simplification and tiny polygon
      // dropping at low zoom, so no client-side customerCount filtering needed.
      // Opacity interpolates from 0.15 at z0 to 0.3 at z8+ so low-zoom
      // coverage looks clean without being too heavy.
      result.push(
        layer.vector({
          id: "territories",
          tileset: getTileUrl(),
          sourceLayer: "territories",
          renderAs: "fill",
          minZoom: 0,
          style: {
            color: { by: "segment", mapping: resolvedSegmentColorMapping },
            fillOpacity: 0.2,
          },
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <TerritoryTooltip
                name={feature.properties.name}
                segment={feature.properties.segment}
                state={feature.properties.state}
                customerCount={feature.properties.customerCount}
                baCode={feature.properties.baCode}
              />
            ),
          },
          events: { onClick: handleClick },
          ...(territoryFilter ? { filter: territoryFilter } : {}),
        })
      );
    } else if (filteredProgramBoundaryData && !hasHighlight) {
      // Program territory boundaries — visible from zoom 0
      result.push(
        layer.geojson({
          id: "program-boundaries",
          data: filteredProgramBoundaryData.geojson,
          renderAs: "fill",
          style: {
            color: { by: "colorKey", mapping: filteredProgramBoundaryData.colorMapping },
            fillOpacity: 0.18,
          },
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <ProgramTerritoryTooltip
                programName={feature.properties.programName}
                programStatus={feature.properties.programStatus}
              />
            ),
          },
          events: {
            onClick: (feature: LayerFeature) => {
              const slug = feature.properties.programSlug;
              if (slug) navigateToDetail("program", slug);
            },
          },
        })
      );
    } else if (filteredGridBoundaryData && !hasHighlight) {
      // Grid operator boundaries — visible from zoom 0
      result.push(
        layer.geojson({
          id: "grid-boundaries",
          data: filteredGridBoundaryData.geojson,
          renderAs: "fill",
          style: {
            color: { by: "colorKey", mapping: filteredGridBoundaryData.colorMapping },
            fillOpacity: 0.18,
          },
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <GridOperatorTooltip
                operatorName={feature.properties.operatorName}
                operatorType={feature.properties.operatorType}
              />
            ),
          },
        })
      );
    }

    // Transmission lines — visible from zoom 3+.
    // tippecanoe drops short segments at low zoom via --drop-lines-by-length,
    // so high-voltage lines dominate at low zoom naturally.
    result.push(
      layer.vector({
        id: "transmission-lines",
        tileset: getTransmissionTileUrl(),
        sourceLayer: "transmission-lines",
        renderAs: "line",
        minZoom: 3,
        visible: visible["transmission-lines"] !== false,
        legend: {
          label: "Transmission Lines",
          swatch: "line",
          color: "var(--color-error-base)",
          group: "Overlays",
        },
        style: {
          color: { by: "voltageClass", mapping: resolvedVoltageClassColorMapping },
          width: 1.5,
          opacity: 0.75,
        },
        ...(visible["transmission-lines"] !== false && {
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <TransmissionTooltip
                owner={feature.properties.owner}
                voltage={feature.properties.voltage}
                status={feature.properties.status}
              />
            ),
          },
        }),
        events: {
          onClick: (feature: LayerFeature) => {
            const slug = feature.properties.slug;
            if (slug) router.push(`/transmission-lines/${slug}`);
          },
        },
      })
    );

    // Substations — visible from zoom 5+.
    // Point layer colored by voltage band; click navigates to the substation
    // detail page. Off by default because the dataset is large and can
    // overwhelm other overlays at low zoom.
    result.push(
      layer.vector({
        id: "substations",
        tileset: getSubstationsTileUrl(),
        sourceLayer: "substations",
        renderAs: "circle",
        minZoom: 5,
        visible: visible.substations === true,
        legend: {
          label: "Substations",
          swatch: "dot",
          color: operatorColor(0),
          group: "Overlays",
        },
        style: {
          color: { by: "voltageBand", mapping: resolvedSubstationVoltageBandColorMapping },
          radius: 3,
          borderWidth: 1,
          borderColor: { hex: "#ffffff" },
          fillOpacity: 0.85,
        },
        ...(visible.substations === true && {
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <SubstationTooltip
                name={feature.properties.name}
                state={feature.properties.state}
                ownerName={feature.properties.ownerName}
                minVoltageKv={feature.properties.minVoltageKv}
                maxVoltageKv={feature.properties.maxVoltageKv}
                substationType={feature.properties.substationType}
              />
            ),
          },
        }),
        events: {
          onClick: (feature: LayerFeature) => {
            const slug = feature.properties.slug;
            if (slug) router.push(`/substations/${slug}`);
          },
        },
      })
    );

    // EV charging stations — visible from zoom 5+.
    // tippecanoe thins points at low zoom via --drop-densest-as-needed.
    // Colored by network; click navigates to station detail page.
    result.push(
      layer.vector({
        id: "ev-charging",
        tileset: getEvChargingTileUrl(),
        sourceLayer: "ev-charging",
        renderAs: "circle",
        minZoom: 5,
        visible: visible["ev-charging"] === true,
        legend: {
          label: "EV Charging",
          swatch: "dot",
          color: evNetworkColor("chargepoint"),
          group: "Overlays",
        },
        style: {
          color: { by: "network", mapping: resolvedEvNetworkColorMapping },
          radius: 4,
          borderWidth: 1,
          borderColor: { hex: "#ffffff" },
          fillOpacity: 0.85,
        },
        ...(visible["ev-charging"] === true && {
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <EVChargingTooltip
                name={feature.properties.name}
                network={feature.properties.network}
                dcFastCount={feature.properties.dcFastCount}
                level2Count={feature.properties.level2Count}
                level1Count={feature.properties.level1Count ?? 0}
                accessCode={feature.properties.accessCode}
              />
            ),
          },
        }),
        events: {
          onClick: (feature: LayerFeature) => {
            const slug = feature.properties.slug;
            if (slug) router.push(`/ev-charging/${slug}`);
          },
        },
      })
    );

    // Pricing nodes — hubs/zones visible from zoom 3+, gen nodes from zoom 7+.
    // Color-coded by ISO/RTO. Hubs and zones are larger circles.
    result.push(
      layer.vector({
        id: "pricing-nodes",
        tileset: getPricingNodesTileUrl(),
        sourceLayer: "pricing-nodes",
        renderAs: "circle",
        minZoom: 3,
        visible: visible["pricing-nodes"] === true,
        legend: {
          label: "Pricing Nodes",
          swatch: "dot",
          color: "var(--color-honey-base)",
          group: "Overlays",
        },
        style: {
          color: { by: "iso", mapping: resolvedPricingNodeIsoColorMapping },
          radius: 3,
          borderWidth: 1,
          borderColor: { hex: "#ffffff" },
          fillOpacity: 0.8,
        },
        ...(visible["pricing-nodes"] === true && {
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <PricingNodeTooltip
                name={feature.properties.name}
                iso={feature.properties.iso}
                nodeType={feature.properties.nodeType}
                zone={feature.properties.zone}
              />
            ),
          },
        }),
        events: {
          onClick: (feature: LayerFeature) => {
            const slug = feature.properties.slug;
            if (slug) router.push(`/pricing-nodes/${slug}`);
          },
        },
      })
    );

    // Power plants — visible from zoom 5+.
    // tippecanoe thins points at low zoom via --drop-densest-as-needed,
    // so showing them earlier is safe without overwhelming the map.
    result.push(
      layer.vector({
        id: "power-plants",
        tileset: getPowerPlantTileUrl(),
        sourceLayer: "power-plants",
        renderAs: "circle",
        minZoom: 5,
        visible: visible["power-plants"] !== false,
        legend: {
          label: "Power Plants",
          swatch: "dot",
          color: "var(--color-honey-base)",
          group: "Overlays",
        },
        style: {
          color: { by: "fuelCategory", mapping: resolvedFuelCategoryColorMapping },
          radius: 4,
          borderWidth: 1,
          borderColor: { hex: "#ffffff" },
          fillOpacity: 0.9,
        },
        ...(visible["power-plants"] !== false && {
          tooltip: {
            trigger: "hover",
            content: (feature: LayerFeature) => (
              <PowerPlantTooltip
                name={feature.properties.name}
                fuelCategory={feature.properties.fuelCategory}
                capacityMw={feature.properties.capacityMw}
                status={feature.properties.status}
              />
            ),
          },
        }),
        events: {
          onClick: (feature: LayerFeature) => {
            const slug = feature.properties.slug;
            if (slug) navigateToDetail("power-plant", slug);
          },
        },
      })
    );

    // Highlight layer for selected entity
    if (state.highlightGeoJSON) {
      result.push(
        layer.geojson({
          id: "highlight",
          data: state.highlightGeoJSON,
          renderAs: "fill",
          style: {
            color: { hex: resolvedHighlightColor },
            fillOpacity: 0.35,
            borderWidth: 2.5,
            borderColor: { hex: resolvedHighlightColor },
          },
        })
      );
    }

    return result;
  }, [
    handleClick,
    navigateToDetail,
    router,
    state.highlightGeoJSON,
    isGridOperatorView,
    isProgramView,
    filteredGridBoundaryData,
    filteredProgramBoundaryData,
    hasHighlight,
    territoryFilter,
    layerVisibility,
    resolvedSubstationVoltageBandColorMapping,
    resolvedFuelCategoryColorMapping,
    resolvedVoltageClassColorMapping,
    resolvedSegmentColorMapping,
    resolvedPricingNodeIsoColorMapping,
    resolvedEvNetworkColorMapping,
    resolvedHighlightColor,
  ]);

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
    <div className="h-full w-full relative">
      <InteractiveMap
        // biome-ignore lint/suspicious/noExplicitAny: InteractiveMap ref type is opaque from @texturehq/edges
        ref={mapRef as React.Ref<any>}
        // biome-ignore lint/style/noNonNullAssertion: effectiveToken is guaranteed non-null when map renders (checked in parent)
        mapboxAccessToken={effectiveToken!}
        initialViewState={US_CENTER}
        mapType={mapType}
        controls={[
          { type: "navigation", position: "bottom-right", showResetZoom: true },
          {
            type: "layers",
            position: "bottom-right",
            currentMapType: mapType,
            onMapTypeChange: setMapType,
            onLayerToggle: (layerId) => {
              if (onOverlayToggle) {
                onOverlayToggle(layerId as keyof MapOverlays);
              }
            },
          },
        ]}
        layers={layers}
      />
    </div>
  );
}
