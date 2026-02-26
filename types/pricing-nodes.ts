/**
 * Type definitions for wholesale electricity pricing nodes.
 *
 * Sources: CAISO OASIS, PJM, ERCOT, MISO, NYISO, ISO-NE, SPP public data.
 * Cross-referenced with EIA-860 power plant coordinates.
 */

export type IsoRto =
  | "CAISO"
  | "PJM"
  | "ERCOT"
  | "MISO"
  | "NYISO"
  | "ISONE"
  | "SPP";

export type PricingNodeType =
  | "gen"       // Generation node (at a power plant)
  | "load"      // Load node (demand point)
  | "hub"       // Trading hub (aggregate reference price)
  | "zone"      // Load zone / pricing zone
  | "sublap"    // Sub-Load Aggregation Point (CAISO-specific)
  | "lap"       // Load Aggregation Point (CAISO-specific)
  | "interface" // Inter-tie / interface point
  | "bus";      // Electrical bus node

export const ISO_LABELS: Record<IsoRto, string> = {
  CAISO: "CAISO",
  PJM: "PJM",
  ERCOT: "ERCOT",
  MISO: "MISO",
  NYISO: "NYISO",
  ISONE: "ISO-NE",
  SPP: "SPP",
};

export const ISO_FULL_NAMES: Record<IsoRto, string> = {
  CAISO: "California Independent System Operator",
  PJM: "PJM Interconnection",
  ERCOT: "Electric Reliability Council of Texas",
  MISO: "Midcontinent Independent System Operator",
  NYISO: "New York Independent System Operator",
  ISONE: "ISO New England",
  SPP: "Southwest Power Pool",
};

export const NODE_TYPE_LABELS: Record<PricingNodeType, string> = {
  gen: "Generation",
  load: "Load",
  hub: "Trading Hub",
  zone: "Load Zone",
  sublap: "Sub-LAP",
  lap: "Load Aggregation Point",
  interface: "Interface",
  bus: "Bus",
};

export const ISO_COLORS: Record<IsoRto, string> = {
  CAISO: "#eab308",   // gold
  PJM: "#3b82f6",     // blue
  ERCOT: "#ef4444",   // red
  MISO: "#22c55e",    // green
  NYISO: "#8b5cf6",   // purple
  ISONE: "#14b8a6",   // teal
  SPP: "#f97316",     // orange
};

export const NODE_TYPE_RADIUS: Record<PricingNodeType, number> = {
  hub: 8,
  zone: 7,
  lap: 7,
  sublap: 6,
  interface: 5,
  gen: 3,
  load: 3,
  bus: 3,
};

export interface PricingNode {
  id: string;
  slug: string;
  name: string;
  iso: IsoRto;
  nodeType: PricingNodeType;
  latitude: number;
  longitude: number;
  zone: string | null;
  state: string | null;
  voltageKv: number | null;
  /** EIA plant code if this node maps to a power plant */
  eiaPlantCode: string | null;
  /** Source dataset or API that provided this node */
  source: string;
}

export const ISOS: IsoRto[] = [
  "CAISO",
  "PJM",
  "ERCOT",
  "MISO",
  "NYISO",
  "ISONE",
  "SPP",
];

export const NODE_TYPES: PricingNodeType[] = [
  "hub",
  "zone",
  "sublap",
  "lap",
  "interface",
  "gen",
  "load",
  "bus",
];

export function getIsoColor(iso: IsoRto): string {
  return ISO_COLORS[iso] ?? "#9ca3af";
}

export function getNodeTypeLabel(type: PricingNodeType): string {
  return NODE_TYPE_LABELS[type] ?? type;
}

export function getNodeRadius(type: PricingNodeType): number {
  return NODE_TYPE_RADIUS[type] ?? 4;
}
