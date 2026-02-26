/**
 * Type definitions for HIFLD Electric Power Transmission Lines dataset.
 * Source: https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-power-transmission-lines
 */

export type VoltageClass =
  | "extra-high"   // 345kV+
  | "high"         // 230–344kV
  | "medium"       // 115–229kV
  | "sub-trans"    // 69–114kV
  | "unknown";

export const VoltageClassLabel: Record<VoltageClass, string> = {
  "extra-high": "Extra High Voltage (345kV+)",
  "high": "High Voltage (230–344kV)",
  "medium": "Medium Voltage (115–229kV)",
  "sub-trans": "Sub-Transmission (69–114kV)",
  "unknown": "Unknown Voltage",
};

export const VOLTAGE_CLASSES: VoltageClass[] = [
  "extra-high",
  "high",
  "medium",
  "sub-trans",
  "unknown",
];

/**
 * Lightweight metadata record for list/search pages.
 * Stored in data/transmission-lines.json.
 */
export interface TransmissionLine {
  objectId: number;
  id: string;
  type: string;
  status: string;
  owner: string;
  voltage: number | null;
  voltClass: string;
  voltageClass: VoltageClass;
  sub1: string;
  sub2: string;
  lengthMiles: number;
  naicsCode: string;
  source: string;
}

/**
 * GeoJSON properties embedded in data/transmission-lines.geojson features.
 */
export interface TransmissionLineGeoProperties {
  objectId: number;
  id: string;
  voltage: number | null;
  voltageClass: VoltageClass;
  owner: string;
  status: string;
  type: string;
  lengthMiles: number;
}
