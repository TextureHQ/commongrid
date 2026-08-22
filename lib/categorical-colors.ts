/**
 * Categorical color assignments for CommonGrid entity variants.
 *
 * Returns CSS `var(--color-viz-categorical-N)` references from the
 * Edges curated 12-color categorical palette. Use these for any
 * variant-color cue (utility segment, ISO, fuel type, EV network,
 * voltage class) — they're hand-picked to maximize visual separation
 * and remain stable across releases of edges-tokens.
 *
 * Previously, CommonGrid maintained its own `--color-cg-*` tokens in
 * `app/globals.css`. Those were a mix of viz-categorical references,
 * Edges named colors, and hardcoded brand hex (Tesla red, etc.). The
 * mapping is now consolidated here so:
 *   - A single source of truth for "what color is X variant"
 *   - All assignments use the curated viz-categorical palette (no
 *     more brand hex sneaking in)
 *   - Adding a new variant means picking an unused N, not adding a
 *     new global CSS var
 */

import type { UtilitySegment } from "@/types/entities";

const VIZ = (n: number) => `var(--color-viz-categorical-${n})` as const;

/**
 * Utility segment → categorical color.
 * Assignments aim for visual distinctness across the 9 segments most
 * likely to appear adjacent in a list.
 */
const UTILITY_SEGMENT_COLOR: Record<UtilitySegment, string> = {
  DISTRIBUTION_COOPERATIVE: VIZ(3), // orange
  GENERATION_AND_TRANSMISSION: VIZ(11), // coral
  INVESTOR_OWNED_UTILITY: VIZ(4), // blue
  MUNICIPAL_UTILITY: VIZ(7), // teal
  COMMUNITY_CHOICE_AGGREGATOR: VIZ(5), // purple
  POLITICAL_SUBDIVISION: VIZ(12), // deep blue
  TRANSMISSION_OPERATOR: VIZ(10), // green
  JOINT_ACTION_AGENCY: VIZ(8), // magenta
  FEDERAL: VIZ(2), // pink-red
};

export function utilityColor(segment: UtilitySegment | string | null | undefined): string {
  if (!segment) return VIZ(1);
  return UTILITY_SEGMENT_COLOR[segment as UtilitySegment] ?? VIZ(1);
}

/**
 * Grid-operator ISO/RTO slug → color. Slugs are lowercase
 * abbreviations (`caiso`, `pjm`, `ercot`, etc.).
 */
const ISO_COLOR: Record<string, string> = {
  caiso: VIZ(3),
  pjm: VIZ(5),
  ercot: VIZ(2),
  miso: VIZ(10),
  nyiso: VIZ(8),
  isone: VIZ(12),
  spp: VIZ(11),
};

export function isoColor(slug: string | null | undefined): string {
  if (!slug) return VIZ(1);
  return ISO_COLOR[slug.toLowerCase()] ?? VIZ(1);
}

/**
 * Power-plant fuel type → color. Fuel keys match the canonical EIA
 * fuel-category lowercase strings.
 */
const FUEL_COLOR: Record<string, string> = {
  solar: VIZ(3), // orange
  gas: VIZ(5), // purple
  hydro: VIZ(4), // blue
  wind: VIZ(7), // teal
  coal: VIZ(12), // deep blue
  nuclear: VIZ(2), // pink-red
  battery: VIZ(8), // magenta
  petroleum: VIZ(11), // coral
  biomass: VIZ(10), // green
};

export function fuelColor(fuel: string | null | undefined): string {
  if (!fuel) return VIZ(1);
  return FUEL_COLOR[fuel.toLowerCase()] ?? VIZ(1);
}

/**
 * EV charging network → color. Network slugs are lowercase
 * (`tesla`, `chargepoint`, etc.).
 */
const EV_NETWORK_COLOR: Record<string, string> = {
  tesla: VIZ(2),
  chargepoint: VIZ(4),
  electrify: VIZ(10),
  evgo: VIZ(3),
  blink: VIZ(8),
  nonnetworked: VIZ(1),
};

export function evNetworkColor(network: string | null | undefined): string {
  if (!network) return VIZ(1);
  return EV_NETWORK_COLOR[network.toLowerCase()] ?? VIZ(1);
}

/**
 * Voltage class → color. We bucket transmission-line voltages into
 * named classes; each gets a stable categorical color. Order
 * approximates "lower voltage → cooler colors, higher voltage → warmer
 * colors" so a voltage map reads with a natural temperature gradient.
 */
type VoltageClass = "extra-high" | "high" | "medium" | "subtrans" | "unknown";

const VOLTAGE_COLOR: Record<VoltageClass, string> = {
  "extra-high": VIZ(2), // pink-red — highest
  high: VIZ(3), // orange
  medium: VIZ(10), // green
  subtrans: VIZ(4), // blue — lower
  unknown: VIZ(1),
};

export function voltageColor(voltageClass: VoltageClass | string | null | undefined): string {
  if (!voltageClass) return VIZ(1);
  return VOLTAGE_COLOR[voltageClass as VoltageClass] ?? VIZ(1);
}

/**
 * Operator boundary palette — 12 distinct categorical colors cycled
 * by index. Used to color adjacent boundary polygons on the map so
 * neighbors are visually separable. The cycle is intentional: the
 * map view often shows 20+ operators, more than the palette has
 * distinct hues, so we accept some repetition as long as adjacent
 * polygons get different colors.
 */
export function operatorColor(index: number): string {
  // Cycle 1..12. `% 12` handles negatives and gives a stable assignment.
  return VIZ((Math.abs(index) % 12) + 1);
}

/**
 * Top-level entity-kind color — used for the overview-panel bucket
 * dots so each entity kind has a stable color identity that matches
 * its list view.
 */
export type EntityKind =
  | "utilities"
  | "grid-operators"
  | "power-plants"
  | "programs"
  | "rates"
  | "transmission-lines"
  | "ev-charging"
  | "pricing-nodes"
  | "substations"
  | "rates";

const ENTITY_KIND_COLOR: Record<EntityKind, string> = {
  utilities: VIZ(4), // blue
  "grid-operators": VIZ(5), // purple
  "power-plants": VIZ(3), // orange
  programs: VIZ(7), // teal
  rates: VIZ(8), // magenta
  "transmission-lines": VIZ(12), // deep blue
  "ev-charging": VIZ(10), // green
  "pricing-nodes": VIZ(11), // coral
  substations: VIZ(2), // pink-red
  rates: VIZ(9), // yellow
};

export function entityKindColor(kind: EntityKind): string {
  return ENTITY_KIND_COLOR[kind];
}
