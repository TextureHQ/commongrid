/**
 * Sync script: Download utility service territory and ISO/RTO boundaries from ArcGIS
 * and create Region records matched to utilities, ISOs, and RTOs.
 *
 * Usage:
 *   cd apps/opengrid
 *   yarn sync:arcgis
 *
 * Outputs:
 *   - data/regions.json — Region metadata array
 *   - public/data/territories/{eiaId}.json — Individual GeoJSON files per service territory
 *   - public/data/territories/iso-{shortName}.json — Individual GeoJSON files per ISO/RTO
 *   - data/utilities.json — Updated with serviceTerritoryId references
 *   - data/isos.json — Updated with regionId references
 *   - data/rtos.json — Updated with regionId references
 */

import * as fs from "node:fs";
import { isValidStateCode } from "@texturehq/geography-config";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { DATA_DIR, readJSON, slugify, TERRITORIES_DIR, writeJSON, writeTerritory } from "./lib";

const SERVICE_TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

const ISO_REGIONS_URL =
  "https://services1.arcgis.com/4yjifSiIG17X0gW4/ArcGIS/rest/services/Data_Center_Demand_by_Region/FeatureServer/2/query";

const PAGE_SIZE = 2000;
const MAX_ALLOWABLE_OFFSET = 0.005;

interface ServiceTerritoryProperties {
  ID: number | null;
  NAME: string | null;
  STATE: string | null;
  CUSTOMERS: number | null;
  TYPE: string | null;
}

interface ISOProperties {
  ID: string | null;
  NAME: string | null;
  STATE: string | null;
  WEBSITE: string | null;
  PEAK_LOAD: number | null;
}

interface RegionRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  eiaId: string | null;
  state: string | null;
  customers: number | null;
  source: string;
  sourceDate: string;
}

interface UtilityRecord {
  id: string;
  slug: string;
  name: string;
  eiaId: string | null;
  serviceTerritoryId: string | null;
  [key: string]: unknown;
}

interface IsoRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  regionId: string | null;
  [key: string]: unknown;
}

const ISO_EIA_ID_TO_SHORT_NAME: Record<string, string> = {
  "2775": "CAISO",
  "5723": "ERCOT",
  "13434": "ISO-NE",
  "56669": "MISO",
  "13501": "NYISO",
  "14725": "PJM",
  "59504": "SPP",
};

async function fetchPaginatedGeoJSON<P>(
  baseUrl: string,
  outFields: string,
  offset = 0.005
): Promise<Feature<Geometry, P>[]> {
  const allFeatures: Feature<Geometry, P>[] = [];
  let resultOffset = 0;

  while (true) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields,
      f: "geojson",
      resultOffset: String(resultOffset),
      resultRecordCount: String(PAGE_SIZE),
      maxAllowableOffset: String(offset),
    });

    console.log(`  Fetching page at offset ${resultOffset}...`);
    const response = await fetch(`${baseUrl}?${params}`);
    if (!response.ok) {
      throw new Error(`ArcGIS request failed: ${response.status} ${response.statusText}`);
    }

    const page = (await response.json()) as FeatureCollection<Geometry, P>;
    const features = page.features ?? [];
    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) break;
    resultOffset += PAGE_SIZE;
  }

  return allFeatures;
}

async function main() {
  console.log("Syncing ArcGIS data -> opengrid\n");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TERRITORIES_DIR, { recursive: true });

  const regions: RegionRecord[] = [];
  const today = new Date().toISOString().split("T")[0];

  // ── 1. Fetch service territory boundaries ──────────────────────────
  console.log("1. Fetching service territory boundaries...");
  const stFeatures = await fetchPaginatedGeoJSON<ServiceTerritoryProperties>(
    SERVICE_TERRITORIES_URL,
    "ID,NAME,STATE,CUSTOMERS,TYPE",
    MAX_ALLOWABLE_OFFSET
  );
  console.log(`\n  Fetched ${stFeatures.length} service territories`);

  let stWritten = 0;
  for (const feature of stFeatures) {
    const props = feature.properties;
    if (!props) continue;

    const eiaId = props.ID != null ? String(props.ID) : null;
    if (!eiaId) continue;

    const name = (props.NAME ?? `Utility ${eiaId}`).replace(/\bCO-OP\b/gi, "COOPERATIVE").replace(/\bE M C\b/gi, "EMC");
    const regionId = `region-st-${eiaId}`;
    const slug = `st-${slugify(name)}-${eiaId}`;
    const state = props.STATE && isValidStateCode(props.STATE) ? props.STATE : null;
    if (props.STATE && !state) {
      console.warn(`  Warning: Invalid state code "${props.STATE}" for territory "${name}"`);
    }

    regions.push({
      id: regionId,
      slug,
      name,
      type: "SERVICE_TERRITORY",
      eiaId,
      state,
      customers: props.CUSTOMERS ?? null,
      source: "ArcGIS HIFLD Electric Retail Service Territories",
      sourceDate: today,
    });

    const territoryGeoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: regionId, name, eiaId, state },
          geometry: feature.geometry,
        },
      ],
    };

    writeTerritory(`${eiaId}.json`, territoryGeoJson);
    stWritten++;
  }
  console.log(`  Wrote ${stWritten} territory GeoJSON files`);

  // ── 2. Fetch ISO/RTO boundaries ───────────────────────────────────
  console.log("\n2. Fetching ISO/RTO boundaries...");
  const isoFeatures = await fetchPaginatedGeoJSON<ISOProperties>(
    ISO_REGIONS_URL,
    "ID,NAME,STATE,WEBSITE,PEAK_LOAD",
    0.01
  );
  console.log(`\n  Fetched ${isoFeatures.length} ISO/RTO regions`);

  let isoWritten = 0;
  for (const feature of isoFeatures) {
    const props = feature.properties;
    if (!props?.NAME) continue;

    const eiaId = props.ID ?? null;
    const shortName = eiaId ? ISO_EIA_ID_TO_SHORT_NAME[eiaId] : null;
    const isISO = !!shortName;
    const key = shortName ? shortName.toLowerCase() : slugify(props.NAME);
    const fileKey = `iso-${key}`;

    const regionId = `region-${fileKey}`;
    const slug = fileKey;
    const regionType = isISO ? "ISO" : "CUSTOM";

    regions.push({
      id: regionId,
      slug,
      name: props.NAME,
      type: regionType,
      eiaId,
      state: props.STATE ?? null,
      customers: null,
      source: "ArcGIS HIFLD Independent System Operators",
      sourceDate: today,
    });

    const geoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: regionId, name: props.NAME, eiaId, shortName },
          geometry: feature.geometry,
        },
      ],
    };

    writeTerritory(`${fileKey}.json`, geoJson);
    isoWritten++;
  }
  console.log(`  Wrote ${isoWritten} ISO/RTO GeoJSON files`);

  // ── 3. Write regions.json ─────────────────────────────────────────
  regions.sort((a, b) => a.name.localeCompare(b.name));
  writeJSON("regions.json", regions);

  // ── 4. Update utilities.json ──────────────────────────────────────
  const utilities: UtilityRecord[] = readJSON("utilities.json");
  const regionByEiaId = new Map(regions.filter((r) => r.type === "SERVICE_TERRITORY").map((r) => [r.eiaId, r]));
  let utilityMatchCount = 0;

  for (const utility of utilities) {
    if (utility.eiaId && regionByEiaId.has(utility.eiaId)) {
      const region = regionByEiaId.get(utility.eiaId);
      if (region) {
        utility.serviceTerritoryId = region.id;
        utilityMatchCount++;
      }
    }
  }

  writeJSON("utilities.json", utilities);
  console.log(`  Updated utilities — ${utilityMatchCount} / ${utilities.length} matched`);

  // ── 5. Update isos.json and rtos.json with regionId ───────────────
  const isoRegionMap = new Map<string, string>();
  for (const region of regions) {
    if (region.type === "ISO" && region.eiaId) {
      const shortName = ISO_EIA_ID_TO_SHORT_NAME[region.eiaId];
      if (shortName) isoRegionMap.set(shortName, region.id);
    }
  }

  const isos: IsoRecord[] = readJSON("isos.json");
  let isoMatchCount = 0;
  for (const iso of isos) {
    const regionId = isoRegionMap.get(iso.shortName);
    if (regionId) {
      iso.regionId = regionId;
      isoMatchCount++;
    }
  }
  writeJSON("isos.json", isos);
  console.log(`  Updated ISOs — ${isoMatchCount} / ${isos.length} matched`);

  const rtos: IsoRecord[] = readJSON("rtos.json");
  let rtoMatchCount = 0;
  for (const rto of rtos) {
    const regionId = isoRegionMap.get(rto.shortName);
    if (regionId) {
      rto.regionId = regionId;
      rtoMatchCount++;
    }
  }
  writeJSON("rtos.json", rtos);
  console.log(`  Updated RTOs — ${rtoMatchCount} / ${rtos.length} matched`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\nSync complete:");
  console.log(`  Service territory regions: ${stWritten}`);
  console.log(`  ISO/RTO regions: ${isoWritten}`);
  console.log(`  Total regions: ${regions.length}`);
  console.log(`  Utility matches: ${utilityMatchCount} / ${utilities.length}`);
  console.log(`  ISO matches: ${isoMatchCount} / ${isos.length}`);
  console.log(`  RTO matches: ${rtoMatchCount} / ${rtos.length}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
