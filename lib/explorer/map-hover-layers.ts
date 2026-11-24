/**
 * Hover highlight layers for the explore map.
 *
 * A highlight outlines the hovered feature in the map's highlight color, the
 * same treatment #535 (CG-219) gave utility territories: a 3px line around a
 * region, the line itself for a transmission line, a ring around a dot.
 *
 * These are plain descriptions, added to the map imperatively by ExplorerMap
 * rather than as Edges layer specs, because every Edges spec declares its own
 * source: a second copy of the same tileset, which tripled tile requests on
 * /explore. A highlight must therefore reuse the source Edges already created
 * for its base layer, and mirror that layer's minZoom so no tiles load any
 * earlier than they did before. Both are covered by tests.
 */

import { resolveCSSColor } from "@/lib/resolve-css-colors";

/** How a hovered feature is drawn. Adjust here rather than per layer. */
export const HOVER_EMPHASIS = {
  /** Matches #535's territory outline. Base transmission lines are 1.5px. */
  outlineWidth: 3,
  /**
   * Ring around a hovered point. Base dots are radius 3–4 with a 1px white
   * ring, so a radius of 7 keeps the 3px ring clear of the dot inside it.
   */
  pointRingRadius: 7,
} as const;

export interface HoverLayerConfig {
  id: string;
  /** Layer this sits directly above; skipped while it isn't on the map. */
  base: string;
  /** Source Edges created for the base layer — never a source of its own. */
  source: string;
  sourceLayer?: string;
  type: "line" | "circle";
  /** Feature property identifying the hovered feature. */
  keyProp: string;
  /** Key of the hovered feature, or null when nothing is hovered. */
  hovered: string | null;
  /** Mirrors the base layer's minZoom so no tiles load earlier than before. */
  minZoom?: number;
  /** The base layer's own filter, so a highlight never shows a feature the base hides. */
  baseFilter?: unknown[];
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

export interface HoverStyle {
  /** The map's highlight color; a CSS variable is resolved before use. */
  color: string;
  /** The territories layer's own filter (segment, program results). */
  territoryFilter?: unknown[] | null;
}

/** The source Edges creates for a layer. */
export function baseSourceId(base: string): string {
  return `${base}-source`;
}

/**
 * A color Mapbox can parse. The highlight color is a CSS variable (Edges
 * resolves those itself; Mapbox rejects them). Resolving needs `document`, so
 * outside the browser the value passes through untouched — highlights are only
 * ever added to a real map.
 */
export function resolveColor(color: string): string {
  return typeof document === "undefined" ? color : resolveCSSColor(color);
}

/** Filter selecting only the hovered feature — matches nothing when nothing is hovered. */
export function hoverFilter(keyProp: string, hovered: string | null, baseFilter?: unknown[]): unknown[] {
  const match = ["==", ["get", keyProp], hovered ?? ""];
  return baseFilter ? ["all", match, baseFilter] : match;
}

/** Outline for a region or line. */
export function lineHoverPaint(color: string): Record<string, unknown> {
  return { "line-color": color, "line-width": HOVER_EMPHASIS.outlineWidth, "line-opacity": 1 };
}

/** Ring around a point, leaving the dot itself as it was. */
export function ringHoverPaint(color: string): Record<string, unknown> {
  return {
    "circle-radius": HOVER_EMPHASIS.pointRingRadius,
    "circle-opacity": 0,
    "circle-stroke-width": HOVER_EMPHASIS.outlineWidth,
    "circle-stroke-color": color,
    "circle-stroke-opacity": 1,
  };
}

/**
 * Highlight layers for every hoverable layer on the map. Configs whose base
 * layer isn't currently on the map are skipped by the caller.
 */
export function buildHoverLayerConfigs(hovered: HoveredKeys, style: HoverStyle): HoverLayerConfig[] {
  const color = resolveColor(style.color);
  const line = lineHoverPaint(color);
  const ring = ringHoverPaint(color);
  return [
    {
      id: "territory-hover-outline",
      base: "territories",
      source: baseSourceId("territories"),
      sourceLayer: "territories",
      type: "line",
      keyProp: "slug",
      hovered: hovered.territory,
      minZoom: 0,
      ...(style.territoryFilter ? { baseFilter: style.territoryFilter } : {}),
      paint: line,
    },
    {
      id: "grid-hover",
      base: "grid-boundaries",
      source: baseSourceId("grid-boundaries"),
      type: "line",
      keyProp: "hoverKey",
      hovered: hovered.gridOperator,
      paint: line,
    },
    {
      id: "program-hover",
      base: "program-boundaries",
      source: baseSourceId("program-boundaries"),
      type: "line",
      keyProp: "programSlug",
      hovered: hovered.program,
      paint: line,
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
      paint: line,
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
      paint: ring,
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
      paint: ring,
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
      paint: ring,
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
      paint: ring,
    },
  ];
}
