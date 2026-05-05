/**
 * Type definitions for the CommonGrid substations dataset.
 *
 * Primary sources:
 *   • OpenStreetMap `power=substation` (ODbL — attribution + share-alike)
 *   • EIA `U.S. Electric Substations` FeatureServer (public domain) — optional augmentation
 *
 * HIFLD's legacy public substations feed was reclassified to secured in April 2023;
 * we reconcile legacy names against `transmission-lines.json` (sub1/sub2) for provenance
 * and surface unmatched names in a CSV audit file.
 */

export type SubstationType = "transmission" | "distribution" | "hybrid" | "unknown";

export type SubstationStatus = "in_service" | "out_of_service" | "planned" | "retired" | "unknown";

export type SubstationSource = "eia" | "osm" | "manual" | "hybrid";

export type VoltageBand = "extra-high" | "high" | "medium" | "sub-trans" | "unknown";

export const VoltageBandLabel: Record<VoltageBand, string> = {
  "extra-high": "Extra High Voltage (345kV+)",
  high: "High Voltage (230–344kV)",
  medium: "Medium Voltage (115–229kV)",
  "sub-trans": "Sub-Transmission (69–114kV)",
  unknown: "Unknown Voltage",
};

/**
 * Lightweight metadata record for list/search pages and seeding.
 * Serialized to `data/substations.json`.
 */
export interface SubstationRecord {
  id: string;
  slug: string;
  name: string;

  /** Best-effort owner display name (free text — not reconciled to utilities.id at sync time). */
  ownerName: string | null;

  // Location
  state: string;
  county: string | null;
  latitude: number;
  longitude: number;

  // Electrical
  minVoltageKv: number | null;
  maxVoltageKv: number | null;
  voltageBand: VoltageBand;
  substationType: SubstationType;
  status: SubstationStatus;

  // Source lineage
  source: SubstationSource;
  sourceUrl: string | null;
  eiaId: string | null;
  osmId: string | null;
  hifldLegacyId: string | null;
}
