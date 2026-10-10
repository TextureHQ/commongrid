/**
 * Hover highlight layers for the explore map.
 *
 * A highlight redraws the hovered feature above its base layer — heavier fill,
 * thicker line, larger dot — in the base layer's own colors, so it reads as the
 * same entity, just emphasized.
 *
 * These are plain descriptions, added to the map imperatively by ExplorerMap
 * rather than as Edges layer specs, because every Edges spec declares its own
 * source: a second copy of the same tileset, which tripled tile requests on
 * /explore. A highlight must therefore reuse the source Edges already created
 * for its base layer, and mirror that layer's minZoom so no tiles load any
 * earlier than they did before. Both are covered by tests.
 */

import { resolveCSSColor } from "@/lib/resolve-css-colors";

export type ColorMapping = Record<string, { hex: string }>;

/**
 * How much a hovered feature is emphasized. Tuned against the live map in both
 * themes (see the values' notes); adjust here rather than per layer.
 *
 * Emphasis is carried by fill and weight, never by a different color: the
 * highlight keeps the feature's own color so it still reads as a utility
 * segment, a voltage class, a fuel type. A heavy outline was tried and
 * dropped — on a map already covered in transmission lines, an outline reads
 * as one more line.
 */
export const HOVER_EMPHASIS = {
  /** Region fill. Base layers draw regions at 0.18–0.2. */
  regionFillOpacity: 0.65,
  /** Hovered transmission line. Normal lines are 1.5px. */
  lineWidth: 5,
  /**
   * Hovered point. Normal radii are 3–4px, so a hovered dot is ~26px across
   * including its ring, against ~10px for its neighbours. Points are usually
   * sparse, so there is often no neighbour in view to compare against — the
   * dot has to read as deliberate on its own, unlike a hovered line, which
   * always has other lines beside it for scale.
   */
  pointRadius: { powerPlants: 9, substations: 8, evCharging: 9, pricingNodes: 8 },
  /** Ring around a hovered point — normal points already carry a 1px white ring. */
  pointRingWidth: 4,
  pointRingColor: "#ffffff",
  /** Shown only if a feature's category is missing from its color mapping. */
  unmappedColor: "#888888",
} as const;

export interface HoverLayerConfig {
  id: string;
  /** Layer this sits directly above; skipped while it isn't on the map. */
  base: string;
  /** Source Edges created for the base layer — never a source of its own. */
  source: string;
  sourceLayer?: string;
  type: "fill" | "line" | "circle";
  /** Feature property identifying the hovered feature. */
  keyProp: string;
  /** Key of the hovered feature, or null when nothing is hovered. */
  hovered: string | null;
  /** Mirrors the base layer's minZoom so no tiles load earlier than before. */
  minZoom?: number;
  paint: Record<string, unknown>;
}

export interface HoveredKeys {
  territory: string | null;
  transmission: string | null;
  powerPlant: string | null;
  substation: string | null;
  evCharging: string | null;
  pricingNode: string | null;
  gridOperator: string | null;
  program: string | null;
}

export interface HoverColorMappings {
  segment: ColorMapping;
  voltageClass: ColorMapping;
  fuelCategory: ColorMapping;
  voltageBand: ColorMapping;
  evNetwork: ColorMapping;
  pricingNodeIso: ColorMapping;
  /** Built from loaded boundary data — absent until it arrives. */
  gridOperator?: ColorMapping | null;
  program?: ColorMapping | null;
}

/** The source Edges creates for a layer. */
export function baseSourceId(base: string): string {
  return `${base}-source`;
}

/** Filter selecting only the hovered feature — matches nothing when nothing is hovered. */
export function hoverFilter(keyProp: string, hovered: string | null): unknown[] {
  return ["==", ["get", keyProp], hovered ?? ""];
}

/**
 * Mapbox `match` expression mirroring an Edges color mapping. Colors are run
 * through resolveCSSColor because some mappings still hold CSS variables
 * (Edges resolves those itself; Mapbox can't parse them). That needs
 * `document`, so outside the browser the value passes through untouched —
 * highlights are only ever added to a real map.
 */
export function matchColor(by: string, mapping: ColorMapping): (string | string[])[] {
  const expr: (string | string[])[] = ["match", ["get", by]];
  const resolve = (hex: string) => (typeof document === "undefined" ? hex : resolveCSSColor(hex));
  for (const [value, color] of Object.entries(mapping)) expr.push(value, resolve(color.hex));
  expr.push(HOVER_EMPHASIS.unmappedColor);
  return expr;
}

/** Fill highlight: heavier fill plus a hairline border, both in the feature's own color. */
export function fillHoverPaint(by: string, mapping: ColorMapping): Record<string, unknown> {
  return {
    "fill-color": matchColor(by, mapping),
    "fill-opacity": HOVER_EMPHASIS.regionFillOpacity,
    // Same color as the fill: an edge, not a competing line.
    "fill-outline-color": matchColor(by, mapping),
  };
}

/** Circle highlight: larger, opaque, with a white ring. */
export function circleHoverPaint(by: string, mapping: ColorMapping, radius: number): Record<string, unknown> {
  return {
    "circle-color": matchColor(by, mapping),
    "circle-radius": radius,
    "circle-opacity": 1,
    "circle-stroke-width": HOVER_EMPHASIS.pointRingWidth,
    "circle-stroke-color": HOVER_EMPHASIS.pointRingColor,
  };
}

/**
 * Highlight layers for every hoverable layer on the map. Configs whose base
 * layer isn't currently on the map are skipped by the caller; the two boundary
 * layers are omitted entirely until their color mapping has loaded.
 */
export function buildHoverLayerConfigs(hovered: HoveredKeys, mappings: HoverColorMappings): HoverLayerConfig[] {
  const configs: HoverLayerConfig[] = [
    {
      id: "territories-hover",
      base: "territories",
      source: baseSourceId("territories"),
      sourceLayer: "territories",
      type: "fill",
      keyProp: "slug",
      hovered: hovered.territory,
      minZoom: 0,
      paint: fillHoverPaint("segment", mappings.segment),
    },
    {
      id: "transmission-hover",
      base: "transmission-lines",
      source: baseSourceId("transmission-lines"),
      sourceLayer: "transmission-lines",
      type: "line",
      keyProp: "id",
      hovered: hovered.transmission,
      minZoom: 3,
      paint: {
        "line-color": matchColor("voltageClass", mappings.voltageClass),
        "line-width": HOVER_EMPHASIS.lineWidth,
        "line-opacity": 1,
      },
    },
    {
      id: "power-plants-hover",
      base: "power-plants",
      source: baseSourceId("power-plants"),
      sourceLayer: "power-plants",
      type: "circle",
      keyProp: "slug",
      hovered: hovered.powerPlant,
      minZoom: 5,
      paint: circleHoverPaint("fuelCategory", mappings.fuelCategory, HOVER_EMPHASIS.pointRadius.powerPlants),
    },
    {
      id: "substations-hover",
      base: "substations",
      source: baseSourceId("substations"),
      sourceLayer: "substations",
      type: "circle",
      keyProp: "slug",
      hovered: hovered.substation,
      minZoom: 5,
      paint: circleHoverPaint("voltageBand", mappings.voltageBand, HOVER_EMPHASIS.pointRadius.substations),
    },
    {
      id: "ev-charging-hover",
      base: "ev-charging",
      source: baseSourceId("ev-charging"),
      sourceLayer: "ev-charging",
      type: "circle",
      keyProp: "slug",
      hovered: hovered.evCharging,
      minZoom: 5,
      paint: circleHoverPaint("network", mappings.evNetwork, HOVER_EMPHASIS.pointRadius.evCharging),
    },
    {
      id: "pricing-nodes-hover",
      base: "pricing-nodes",
      source: baseSourceId("pricing-nodes"),
      sourceLayer: "pricing-nodes",
      type: "circle",
      keyProp: "slug",
      hovered: hovered.pricingNode,
      minZoom: 3,
      paint: circleHoverPaint("iso", mappings.pricingNodeIso, HOVER_EMPHASIS.pointRadius.pricingNodes),
    },
  ];

  if (mappings.gridOperator) {
    configs.push({
      id: "grid-hover",
      base: "grid-boundaries",
      source: baseSourceId("grid-boundaries"),
      type: "fill",
      keyProp: "hoverKey",
      hovered: hovered.gridOperator,
      paint: fillHoverPaint("colorKey", mappings.gridOperator),
    });
  }

  if (mappings.program) {
    configs.push({
      id: "program-hover",
      base: "program-boundaries",
      source: baseSourceId("program-boundaries"),
      type: "fill",
      keyProp: "programSlug",
      hovered: hovered.program,
      paint: fillHoverPaint("colorKey", mappings.program),
    });
  }

  return configs;
}
