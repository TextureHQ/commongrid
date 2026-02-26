/**
 * Sync script: Build the wholesale electricity pricing nodes dataset.
 *
 * This script:
 * 1. Fetches CAISO pricing node names from OASIS ATL_PNODE
 * 2. Cross-references with EIA-860 power plant data for coordinates
 * 3. Defines well-known trading hubs, load zones, and SUBLAPs for all 7 ISOs
 * 4. Outputs data/pricing-nodes.json
 *
 * Usage:
 *   cd opengrid
 *   npx tsx scripts/sync-pricing-nodes.ts
 *
 * Data sources:
 *   - CAISO OASIS API (free, no key)
 *   - EIA-860 power plant data (already in data/power-plants.json)
 *   - Manually curated hub/zone/SUBLAP coordinates
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ───── Types ────────────────────────────────────────────────────────────────

interface RawPricingNode {
  id: string;
  name: string;
  iso: string;
  nodeType: string;
  latitude: number;
  longitude: number;
  zone: string | null;
  state: string | null;
  voltageKv: number | null;
  eiaPlantCode: string | null;
  source: string;
}

interface PowerPlant {
  id: string;
  slug: string;
  name: string;
  plantCode: string;
  state: string;
  latitude: number;
  longitude: number;
  primaryFuel: string | null;
  totalCapacityMw: number;
  baCode: string | null;
}

// ───── Helpers ──────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(name: string, iso: string, nodeType: string): string {
  return slugify(`${name}-${iso}-${nodeType}`);
}

// ───── Well-Known Trading Hubs ──────────────────────────────────────────────
// Trading hubs are aggregate reference pricing points. Their "location" is the
// approximate centroid of the region they represent.

const TRADING_HUBS: RawPricingNode[] = [
  // CAISO
  { id: "caiso-sp15", name: "SP15 (South of Path 15)", iso: "CAISO", nodeType: "hub", latitude: 34.05, longitude: -118.25, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-np15", name: "NP15 (North of Path 15)", iso: "CAISO", nodeType: "hub", latitude: 37.77, longitude: -122.42, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-zp26", name: "ZP26 (Zone Path 26)", iso: "CAISO", nodeType: "hub", latitude: 35.37, longitude: -119.02, zone: "ZP26", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  // PJM
  { id: "pjm-western-hub", name: "PJM Western Hub", iso: "PJM", nodeType: "hub", latitude: 40.44, longitude: -79.99, zone: "WEST", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-eastern-hub", name: "PJM Eastern Hub", iso: "PJM", nodeType: "hub", latitude: 39.95, longitude: -75.17, zone: "EAST", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-ade-hub", name: "AEP-Dayton Hub", iso: "PJM", nodeType: "hub", latitude: 39.76, longitude: -84.19, zone: "AEP", state: "OH", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-chicago-hub", name: "Chicago Hub", iso: "PJM", nodeType: "hub", latitude: 41.88, longitude: -87.63, zone: "COMED", state: "IL", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-nj-hub", name: "New Jersey Hub", iso: "PJM", nodeType: "hub", latitude: 40.22, longitude: -74.77, zone: "PSEG", state: "NJ", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-dominion-hub", name: "Dominion Hub", iso: "PJM", nodeType: "hub", latitude: 37.54, longitude: -77.44, zone: "DOM", state: "VA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  // ERCOT
  { id: "ercot-north-hub", name: "ERCOT North Hub", iso: "ERCOT", nodeType: "hub", latitude: 32.78, longitude: -96.80, zone: "NORTH", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-south-hub", name: "ERCOT South Hub", iso: "ERCOT", nodeType: "hub", latitude: 29.42, longitude: -98.49, zone: "SOUTH", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-west-hub", name: "ERCOT West Hub", iso: "ERCOT", nodeType: "hub", latitude: 31.99, longitude: -102.08, zone: "WEST", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-houston-hub", name: "ERCOT Houston Hub", iso: "ERCOT", nodeType: "hub", latitude: 29.76, longitude: -95.37, zone: "HOUSTON", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  // MISO
  { id: "miso-indiana-hub", name: "Indiana Hub", iso: "MISO", nodeType: "hub", latitude: 39.77, longitude: -86.16, zone: "IN", state: "IN", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-michigan-hub", name: "Michigan Hub", iso: "MISO", nodeType: "hub", latitude: 42.33, longitude: -83.05, zone: "MI", state: "MI", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-minnesota-hub", name: "Minnesota Hub", iso: "MISO", nodeType: "hub", latitude: 44.98, longitude: -93.27, zone: "MN", state: "MN", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-louisiana-hub", name: "Louisiana Hub", iso: "MISO", nodeType: "hub", latitude: 30.46, longitude: -91.19, zone: "LA", state: "LA", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-arkansas-hub", name: "Arkansas Hub", iso: "MISO", nodeType: "hub", latitude: 34.75, longitude: -92.29, zone: "AR", state: "AR", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-texas-hub", name: "MISO Texas Hub", iso: "MISO", nodeType: "hub", latitude: 30.95, longitude: -93.99, zone: "TX", state: "TX", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-illinois-hub", name: "Illinois Hub", iso: "MISO", nodeType: "hub", latitude: 39.80, longitude: -89.65, zone: "IL", state: "IL", voltageKv: null, eiaPlantCode: null, source: "miso" },
  // NYISO
  { id: "nyiso-zone-a", name: "NYISO Zone A (West)", iso: "NYISO", nodeType: "zone", latitude: 42.89, longitude: -78.88, zone: "A", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-b", name: "NYISO Zone B (Genesee)", iso: "NYISO", nodeType: "zone", latitude: 43.16, longitude: -77.61, zone: "B", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-c", name: "NYISO Zone C (Central)", iso: "NYISO", nodeType: "zone", latitude: 43.05, longitude: -76.15, zone: "C", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-d", name: "NYISO Zone D (North)", iso: "NYISO", nodeType: "zone", latitude: 44.70, longitude: -73.45, zone: "D", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-e", name: "NYISO Zone E (Mohawk Valley)", iso: "NYISO", nodeType: "zone", latitude: 43.10, longitude: -75.23, zone: "E", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-f", name: "NYISO Zone F (Capital)", iso: "NYISO", nodeType: "zone", latitude: 42.65, longitude: -73.76, zone: "F", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-g", name: "NYISO Zone G (Hudson Valley)", iso: "NYISO", nodeType: "zone", latitude: 41.50, longitude: -74.01, zone: "G", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-h", name: "NYISO Zone H (Millwood)", iso: "NYISO", nodeType: "zone", latitude: 41.20, longitude: -73.82, zone: "H", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-i", name: "NYISO Zone I (Dunwoodie)", iso: "NYISO", nodeType: "zone", latitude: 40.95, longitude: -73.87, zone: "I", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-j", name: "NYISO Zone J (NYC)", iso: "NYISO", nodeType: "zone", latitude: 40.71, longitude: -74.01, zone: "J", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  { id: "nyiso-zone-k", name: "NYISO Zone K (Long Island)", iso: "NYISO", nodeType: "zone", latitude: 40.79, longitude: -73.14, zone: "K", state: "NY", voltageKv: null, eiaPlantCode: null, source: "nyiso" },
  // ISO-NE
  { id: "isone-hub", name: "ISO-NE Internal Hub", iso: "ISONE", nodeType: "hub", latitude: 42.36, longitude: -71.06, zone: "NEPOOL", state: "MA", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-me", name: "Maine Load Zone", iso: "ISONE", nodeType: "zone", latitude: 44.31, longitude: -69.78, zone: "ME", state: "ME", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-nh", name: "New Hampshire Load Zone", iso: "ISONE", nodeType: "zone", latitude: 43.21, longitude: -71.54, zone: "NH", state: "NH", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-vt", name: "Vermont Load Zone", iso: "ISONE", nodeType: "zone", latitude: 44.26, longitude: -72.58, zone: "VT", state: "VT", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-ct", name: "Connecticut Load Zone", iso: "ISONE", nodeType: "zone", latitude: 41.76, longitude: -72.68, zone: "CT", state: "CT", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-ri", name: "Rhode Island Load Zone", iso: "ISONE", nodeType: "zone", latitude: 41.82, longitude: -71.41, zone: "RI", state: "RI", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-sema", name: "SE Massachusetts Load Zone", iso: "ISONE", nodeType: "zone", latitude: 41.64, longitude: -70.93, zone: "SEMASS", state: "MA", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-wcma", name: "W/C Massachusetts Load Zone", iso: "ISONE", nodeType: "zone", latitude: 42.27, longitude: -71.80, zone: "WCMASS", state: "MA", voltageKv: null, eiaPlantCode: null, source: "isone" },
  { id: "isone-nema", name: "NE Massachusetts / Boston Load Zone", iso: "ISONE", nodeType: "zone", latitude: 42.36, longitude: -71.06, zone: "NEMASS", state: "MA", voltageKv: null, eiaPlantCode: null, source: "isone" },
  // SPP
  { id: "spp-north-hub", name: "SPP North Hub", iso: "SPP", nodeType: "hub", latitude: 38.63, longitude: -98.32, zone: "NORTH", state: "KS", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-south-hub", name: "SPP South Hub", iso: "SPP", nodeType: "hub", latitude: 35.47, longitude: -97.52, zone: "SOUTH", state: "OK", voltageKv: null, eiaPlantCode: null, source: "spp" },
];

// ───── CAISO SUBLAPs ────────────────────────────────────────────────────────
// Sub-Load Aggregation Points with approximate geographic centroids

const CAISO_SUBLAPS: RawPricingNode[] = [
  { id: "caiso-sublap-pgae-bay", name: "PG&E Bay", iso: "CAISO", nodeType: "sublap", latitude: 37.56, longitude: -122.0, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-pgae-valley", name: "PG&E Valley", iso: "CAISO", nodeType: "sublap", latitude: 37.95, longitude: -121.29, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-pgae-coast", name: "PG&E Coast", iso: "CAISO", nodeType: "sublap", latitude: 37.0, longitude: -122.0, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-pgae-north", name: "PG&E North", iso: "CAISO", nodeType: "sublap", latitude: 39.5, longitude: -121.5, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-sce-east", name: "SCE East", iso: "CAISO", nodeType: "sublap", latitude: 34.05, longitude: -117.18, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-sce-west", name: "SCE West", iso: "CAISO", nodeType: "sublap", latitude: 33.95, longitude: -118.40, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-sdge", name: "SDG&E", iso: "CAISO", nodeType: "sublap", latitude: 32.72, longitude: -117.16, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-sublap-vea", name: "Valley Electric Assn", iso: "CAISO", nodeType: "sublap", latitude: 36.47, longitude: -116.07, zone: "SP15", state: "NV", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  // CAISO LAPs (Load Aggregation Points)
  { id: "caiso-lap-pgae", name: "PG&E LAP", iso: "CAISO", nodeType: "lap", latitude: 37.77, longitude: -121.90, zone: "NP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-lap-sce", name: "SCE LAP", iso: "CAISO", nodeType: "lap", latitude: 34.05, longitude: -117.75, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
  { id: "caiso-lap-sdge", name: "SDG&E LAP", iso: "CAISO", nodeType: "lap", latitude: 32.72, longitude: -117.16, zone: "SP15", state: "CA", voltageKv: null, eiaPlantCode: null, source: "caiso-oasis" },
];

// ───── ERCOT Load Zones ─────────────────────────────────────────────────────

const ERCOT_ZONES: RawPricingNode[] = [
  { id: "ercot-lz-north", name: "ERCOT North Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 32.78, longitude: -96.80, zone: "LZ_NORTH", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-south", name: "ERCOT South Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 29.42, longitude: -98.49, zone: "LZ_SOUTH", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-west", name: "ERCOT West Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 31.99, longitude: -102.08, zone: "LZ_WEST", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-houston", name: "ERCOT Houston Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 29.76, longitude: -95.37, zone: "LZ_HOUSTON", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-lcra", name: "ERCOT LCRA Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 30.27, longitude: -97.74, zone: "LZ_LCRA", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-raybn", name: "ERCOT Rayburn Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 33.25, longitude: -95.50, zone: "LZ_RAYBN", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-cps", name: "ERCOT CPS Energy Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 29.42, longitude: -98.49, zone: "LZ_CPS", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
  { id: "ercot-lz-aen", name: "ERCOT AEN Load Zone", iso: "ERCOT", nodeType: "zone", latitude: 30.27, longitude: -97.74, zone: "LZ_AEN", state: "TX", voltageKv: null, eiaPlantCode: null, source: "ercot" },
];

// ───── PJM Zones ────────────────────────────────────────────────────────────

const PJM_ZONES: RawPricingNode[] = [
  { id: "pjm-aep", name: "AEP Zone", iso: "PJM", nodeType: "zone", latitude: 38.35, longitude: -81.63, zone: "AEP", state: "WV", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-comed", name: "ComEd Zone", iso: "PJM", nodeType: "zone", latitude: 41.88, longitude: -87.63, zone: "COMED", state: "IL", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-dpl", name: "Delmarva Zone", iso: "PJM", nodeType: "zone", latitude: 39.16, longitude: -75.52, zone: "DPL", state: "DE", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-dom", name: "Dominion Zone", iso: "PJM", nodeType: "zone", latitude: 37.54, longitude: -77.44, zone: "DOM", state: "VA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-duq", name: "Duquesne Zone", iso: "PJM", nodeType: "zone", latitude: 40.44, longitude: -79.99, zone: "DUQ", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-jcpl", name: "JCP&L Zone", iso: "PJM", nodeType: "zone", latitude: 40.49, longitude: -74.45, zone: "JCPL", state: "NJ", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-meted", name: "Met-Ed Zone", iso: "PJM", nodeType: "zone", latitude: 40.34, longitude: -75.93, zone: "METED", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-peco", name: "PECO Zone", iso: "PJM", nodeType: "zone", latitude: 40.00, longitude: -75.14, zone: "PECO", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-penelec", name: "Penelec Zone", iso: "PJM", nodeType: "zone", latitude: 41.24, longitude: -78.70, zone: "PENELEC", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-pepco", name: "Pepco Zone", iso: "PJM", nodeType: "zone", latitude: 38.90, longitude: -77.04, zone: "PEPCO", state: "DC", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-ppl", name: "PPL Zone", iso: "PJM", nodeType: "zone", latitude: 40.60, longitude: -75.49, zone: "PPL", state: "PA", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-pseg", name: "PSEG Zone", iso: "PJM", nodeType: "zone", latitude: 40.74, longitude: -74.17, zone: "PSEG", state: "NJ", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-atsi", name: "ATSI Zone", iso: "PJM", nodeType: "zone", latitude: 41.10, longitude: -80.65, zone: "ATSI", state: "OH", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-dayton", name: "Dayton P&L Zone", iso: "PJM", nodeType: "zone", latitude: 39.76, longitude: -84.19, zone: "DAY", state: "OH", voltageKv: null, eiaPlantCode: null, source: "pjm" },
  { id: "pjm-bge", name: "BGE Zone", iso: "PJM", nodeType: "zone", latitude: 39.29, longitude: -76.61, zone: "BGE", state: "MD", voltageKv: null, eiaPlantCode: null, source: "pjm" },
];

// ───── MISO Zones ───────────────────────────────────────────────────────────

const MISO_ZONES: RawPricingNode[] = [
  { id: "miso-zone-1", name: "MISO Zone 1 (Northern)", iso: "MISO", nodeType: "zone", latitude: 44.95, longitude: -93.09, zone: "1", state: "MN", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-2", name: "MISO Zone 2 (Eastern WI)", iso: "MISO", nodeType: "zone", latitude: 43.04, longitude: -87.91, zone: "2", state: "WI", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-3", name: "MISO Zone 3 (Western WI)", iso: "MISO", nodeType: "zone", latitude: 43.78, longitude: -89.79, zone: "3", state: "WI", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-4", name: "MISO Zone 4 (Illinois)", iso: "MISO", nodeType: "zone", latitude: 39.80, longitude: -89.65, zone: "4", state: "IL", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-5", name: "MISO Zone 5 (Missouri)", iso: "MISO", nodeType: "zone", latitude: 38.63, longitude: -90.20, zone: "5", state: "MO", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-6", name: "MISO Zone 6 (Indiana)", iso: "MISO", nodeType: "zone", latitude: 39.77, longitude: -86.16, zone: "6", state: "IN", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-7", name: "MISO Zone 7 (Michigan)", iso: "MISO", nodeType: "zone", latitude: 42.73, longitude: -84.56, zone: "7", state: "MI", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-8", name: "MISO Zone 8 (Arkansas)", iso: "MISO", nodeType: "zone", latitude: 34.75, longitude: -92.29, zone: "8", state: "AR", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-9", name: "MISO Zone 9 (Louisiana/Texas)", iso: "MISO", nodeType: "zone", latitude: 30.46, longitude: -91.19, zone: "9", state: "LA", voltageKv: null, eiaPlantCode: null, source: "miso" },
  { id: "miso-zone-10", name: "MISO Zone 10 (Mississippi)", iso: "MISO", nodeType: "zone", latitude: 32.30, longitude: -90.18, zone: "10", state: "MS", voltageKv: null, eiaPlantCode: null, source: "miso" },
];

// ───── SPP Zones ────────────────────────────────────────────────────────────

const SPP_ZONES: RawPricingNode[] = [
  { id: "spp-sps", name: "SPS (Xcel Southwest)", iso: "SPP", nodeType: "zone", latitude: 34.18, longitude: -101.84, zone: "SPS", state: "TX", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-wfec", name: "Western Farmers Electric Coop", iso: "SPP", nodeType: "zone", latitude: 34.98, longitude: -97.52, zone: "WFEC", state: "OK", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-okge", name: "OG&E Zone", iso: "SPP", nodeType: "zone", latitude: 35.47, longitude: -97.52, zone: "OKGE", state: "OK", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-aepw", name: "AEP West Zone", iso: "SPP", nodeType: "zone", latitude: 36.13, longitude: -95.95, zone: "AEPW", state: "OK", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-kcpl", name: "Evergy Kansas City Zone", iso: "SPP", nodeType: "zone", latitude: 39.10, longitude: -94.58, zone: "KCPL", state: "MO", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-nppd", name: "Nebraska PPD Zone", iso: "SPP", nodeType: "zone", latitude: 40.81, longitude: -96.70, zone: "NPPD", state: "NE", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-grda", name: "GRDA Zone", iso: "SPP", nodeType: "zone", latitude: 36.30, longitude: -95.15, zone: "GRDA", state: "OK", voltageKv: null, eiaPlantCode: null, source: "spp" },
  { id: "spp-swpa", name: "SWPA Zone", iso: "SPP", nodeType: "zone", latitude: 36.38, longitude: -94.20, zone: "SWPA", state: "AR", voltageKv: null, eiaPlantCode: null, source: "spp" },
];

// ───── Balancing Authority to ISO mapping (for power plant matching) ────────

const BA_TO_ISO: Record<string, string> = {
  // CAISO
  CISO: "CAISO",
  // PJM
  PJM: "PJM",
  // ERCOT
  ERCO: "ERCOT",
  // MISO
  MISO: "MISO",
  // NYISO
  NYIS: "NYISO",
  // ISO-NE
  ISNE: "ISONE",
  // SPP
  SWPP: "SPP",
};

// ───── ISO BA codes for plant filtering ─────────────────────────────────────

const ISO_BA_CODES: Record<string, string[]> = {
  CAISO: ["CISO"],
  PJM: ["PJM"],
  ERCOT: ["ERCO"],
  MISO: ["MISO"],
  NYISO: ["NYIS"],
  ISONE: ["ISNE"],
  SPP: ["SWPP"],
};

// ───── State to approximate ISO mapping (for plants without BA code) ────────

const STATE_ISO_MAP: Record<string, string> = {
  CA: "CAISO",
  TX: "ERCOT",
  NY: "NYISO",
};

// ───── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Syncing wholesale electricity pricing nodes...\n");

  // ── 1. Load power plant data ────────────────────────────────────────────
  console.log("1. Loading power plant data...");
  const plantsPath = path.join(process.cwd(), "data", "power-plants.json");
  const plantsRaw = fs.readFileSync(plantsPath, "utf-8");
  const plants: PowerPlant[] = JSON.parse(plantsRaw);
  console.log(`   Loaded ${plants.length} power plants`);

  // ── 2. Collect all curated nodes ────────────────────────────────────────
  console.log("\n2. Building curated node dataset...");
  const allNodes: RawPricingNode[] = [
    ...TRADING_HUBS,
    ...CAISO_SUBLAPS,
    ...ERCOT_ZONES,
    ...PJM_ZONES,
    ...MISO_ZONES,
    ...SPP_ZONES,
  ];
  console.log(`   ${TRADING_HUBS.length} trading hubs`);
  console.log(`   ${CAISO_SUBLAPS.length} CAISO SUBLAPs/LAPs`);
  console.log(`   ${ERCOT_ZONES.length} ERCOT load zones`);
  console.log(`   ${PJM_ZONES.length} PJM zones`);
  console.log(`   ${MISO_ZONES.length} MISO zones`);
  console.log(`   ${SPP_ZONES.length} SPP zones`);

  // ── 3. Generate generation nodes from power plant data ──────────────────
  console.log("\n3. Creating generation pricing nodes from EIA-860 plants...");
  const genNodes: RawPricingNode[] = [];

  // Filter plants to those in ISO regions and with capacity > 10 MW
  // (most plants > 10 MW are pricing nodes in their ISO)
  const minCapacity = 10;
  let matchedCount = 0;

  for (const plant of plants) {
    // Determine ISO from BA code
    let iso: string | null = null;
    if (plant.baCode) {
      iso = BA_TO_ISO[plant.baCode] ?? null;
    }
    if (!iso) {
      iso = STATE_ISO_MAP[plant.state] ?? null;
    }

    if (!iso) continue;
    if (plant.totalCapacityMw < minCapacity) continue;
    if (!plant.latitude || !plant.longitude) continue;

    const id = `${iso.toLowerCase()}-gen-${plant.plantCode}`;
    genNodes.push({
      id,
      name: plant.name,
      iso,
      nodeType: "gen",
      latitude: plant.latitude,
      longitude: plant.longitude,
      zone: null,
      state: plant.state,
      voltageKv: null,
      eiaPlantCode: plant.plantCode,
      source: "eia-860",
    });
    matchedCount++;
  }

  console.log(`   ${matchedCount} generation nodes from plants > ${minCapacity} MW`);

  // ── 4. Merge all nodes ──────────────────────────────────────────────────
  console.log("\n4. Merging all nodes...");
  allNodes.push(...genNodes);

  // Deduplicate by id
  const seen = new Set<string>();
  const dedupedNodes = allNodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Add slugs
  const slugsSeen = new Map<string, number>();
  const finalNodes = dedupedNodes.map((node) => {
    let slug = buildSlug(node.name, node.iso, node.nodeType);
    const count = slugsSeen.get(slug) ?? 0;
    if (count > 0) {
      slug = `${slug}-${count}`;
    }
    slugsSeen.set(slug, count + 1);
    return { ...node, slug };
  });

  // ── 5. Statistics ──────────────────────────────────────────────────────
  console.log("\n5. Dataset statistics:");
  const byIso = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const node of finalNodes) {
    byIso.set(node.iso, (byIso.get(node.iso) ?? 0) + 1);
    byType.set(node.nodeType, (byType.get(node.nodeType) ?? 0) + 1);
  }
  console.log(`   Total nodes: ${finalNodes.length}`);
  console.log("   By ISO:");
  for (const [iso, count] of [...byIso.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${iso}: ${count}`);
  }
  console.log("   By type:");
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${type}: ${count}`);
  }

  // ── 6. Write output ───────────────────────────────────────────────────
  const outPath = path.join(process.cwd(), "data", "pricing-nodes.json");
  fs.writeFileSync(outPath, JSON.stringify(finalNodes, null, 2));
  console.log(`\n✅ Wrote ${finalNodes.length} pricing nodes → ${outPath}`);

  // ── 7. Update homepage count ──────────────────────────────────────────
  // The homepage uses a hardcoded count to avoid importing large JSON
  const homepagePath = path.join(process.cwd(), "app", "(shell)", "page.tsx");
  if (fs.existsSync(homepagePath)) {
    let homepage = fs.readFileSync(homepagePath, "utf-8");
    // Match pattern: const pricingNodeCount = NNNN;
    const pattern = /const pricingNodeCount = \d+;/;
    const replacement = `const pricingNodeCount = ${finalNodes.length};`;
    if (pattern.test(homepage)) {
      homepage = homepage.replace(pattern, replacement);
      fs.writeFileSync(homepagePath, homepage);
      console.log(`   Updated homepage count → ${finalNodes.length}`);
    }
  }
}

main().catch((err) => {
  console.error("Failed to sync pricing nodes:", err);
  process.exit(1);
});
