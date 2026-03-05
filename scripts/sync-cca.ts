/**
 * Sync script: Download CCA service territory boundaries from the California
 * Energy Commission's ArcGIS layer and match them to our CCA utilities.
 *
 * Data source: CEC Electric Load Serving Entities (Other)
 * https://cecgis-caenergy.opendata.arcgis.com/datasets/CAEnergy::electric-load-serving-entities-other
 *
 * Usage:
 *   cd apps/commongrid
 *   yarn sync:cca
 *
 * Outputs:
 *   - public/data/territories/cca-{slug}.json — Individual GeoJSON files per CCA
 *   - data/regions.json — Updated with CCA region records
 *   - data/utilities.json — Updated with serviceTerritoryId references for matched CCAs
 */

import * as fs from "node:fs";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { readJSON, slugify, TERRITORIES_DIR, writeJSON, writeTerritory } from "./lib";

const CCA_FEATURE_SERVER_URL =
  "https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/ElectricLoadServingEntities_Other/FeatureServer/0/query";

interface CCAProperties {
  OBJECTID: number;
  Acronym: string | null;
  Utility: string | null;
  Type: string | null;
  AgencyNum: number | null;
  HIFLD_ID: string | null;
  URL: string | null;
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
  segment: string;
  serviceTerritoryId: string | null;
  [key: string]: unknown;
}

// Mapping from CEC utility name (normalized) to our EIA ID for cases where
// names don't match well enough for fuzzy matching.
const CEC_NAME_TO_EIA_ID: Record<string, string> = {
  mce: "56692", // MCE = Marin Clean Energy
  "clean power alliance": "61526", // CPA = Clean Power Alliance of Southern California
  "peninsula clean energy": "60402", // Peninsula Clean Energy Authority
  "lancaster energy": "59625", // Lancaster Choice Energy
  "valley clean energy": "61462", // Valley Clean Energy Alliance
  "central coast community energy": "61432", // 3CE — was in Notion under IOU, actually a CCA
};

function ccaSlugify(name: string): string {
  return slugify(name, { stripParentheticals: true });
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // Remove parentheticals like (SDCP)
    .replace(/authority|alliance/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fetchCCAFeatures(): Promise<Feature<Geometry, CCAProperties>[]> {
  const params = new URLSearchParams({
    where: "Type='CCA'",
    outFields: "OBJECTID,Acronym,Utility,Type,AgencyNum,HIFLD_ID,URL",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "100",
  });

  console.log("  Fetching CCA features from CEC ArcGIS...");
  const response = await fetch(`${CCA_FEATURE_SERVER_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`CEC ArcGIS request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeatureCollection<Geometry, CCAProperties>;
  return data.features ?? [];
}

function matchCCAToUtility(cecName: string, utilities: UtilityRecord[]): UtilityRecord | null {
  const normalized = normalizeForMatch(cecName);

  // 1. Check explicit mapping
  const explicitEiaId = CEC_NAME_TO_EIA_ID[normalized.trim()];
  if (explicitEiaId !== undefined) {
    if (explicitEiaId === "") return null; // Explicitly skip
    return utilities.find((u) => u.eiaId === explicitEiaId) ?? null;
  }

  // Also check against the raw lowercase name for explicit mappings
  const rawLower = cecName
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .trim();
  const explicitByRaw = CEC_NAME_TO_EIA_ID[rawLower];
  if (explicitByRaw !== undefined) {
    if (explicitByRaw === "") return null;
    return utilities.find((u) => u.eiaId === explicitByRaw) ?? null;
  }

  // 2. Try exact slug match
  const cecSlug = ccaSlugify(cecName);
  const slugMatch = utilities.find((u) => u.slug === cecSlug);
  if (slugMatch) return slugMatch;

  // 3. Fuzzy: check if CEC normalized name is contained in utility name or vice versa
  const ccaUtilities = utilities.filter((u) => u.segment === "COMMUNITY_CHOICE_AGGREGATOR");
  for (const utility of ccaUtilities) {
    const utilNorm = normalizeForMatch(utility.name);
    if (utilNorm.includes(normalized) || normalized.includes(utilNorm)) {
      return utility;
    }
  }

  // 4. Word overlap scoring
  const cecWords = new Set(normalized.split(/\s+/).filter((w) => w.length > 2));
  let bestMatch: UtilityRecord | null = null;
  let bestScore = 0;

  for (const utility of ccaUtilities) {
    const utilWords = new Set(
      normalizeForMatch(utility.name)
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    const overlap = [...cecWords].filter((w) => utilWords.has(w)).length;
    const score = overlap / Math.max(cecWords.size, utilWords.size);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = utility;
    }
  }

  return bestMatch;
}

async function main() {
  console.log("Syncing CCA territories from CEC ArcGIS\n");

  fs.mkdirSync(TERRITORIES_DIR, { recursive: true });

  const today = new Date().toISOString().split("T")[0];

  // ── 1. Fetch CCA boundaries ────────────────────────────────────────
  console.log("1. Fetching CCA territory boundaries...");
  const ccaFeatures = await fetchCCAFeatures();
  console.log(`  Fetched ${ccaFeatures.length} CCA territories\n`);

  // ── 2. Load existing data ──────────────────────────────────────────
  const utilities: UtilityRecord[] = readJSON("utilities.json");
  const regions: RegionRecord[] = readJSON("regions.json");

  // Remove any existing CCA regions (for idempotency)
  const existingCCARegionIds = new Set(regions.filter((r) => r.type === "CCA_TERRITORY").map((r) => r.id));
  const filteredRegions = regions.filter((r) => r.type !== "CCA_TERRITORY");

  // Clear existing CCA serviceTerritoryIds
  for (const utility of utilities) {
    if (utility.serviceTerritoryId && existingCCARegionIds.has(utility.serviceTerritoryId)) {
      utility.serviceTerritoryId = null;
    }
  }

  // ── 3. Process each CCA feature ────────────────────────────────────
  console.log("2. Matching CCA territories to utilities...");
  let matched = 0;
  let unmatched = 0;
  const newRegions: RegionRecord[] = [];

  for (const feature of ccaFeatures) {
    const props = feature.properties;
    if (!props?.Utility) continue;

    const cecName = props.Utility;
    const utility = matchCCAToUtility(cecName, utilities);

    const slug = `cca-${ccaSlugify(cecName)}`;
    const regionId = `region-${slug}`;
    const displayName = cecName.replace(/\s*\([^)]*\)\s*$/, ""); // Strip trailing acronym

    // Create region record
    newRegions.push({
      id: regionId,
      slug,
      name: displayName,
      type: "CCA_TERRITORY",
      eiaId: utility?.eiaId ?? null,
      state: "CA",
      customers: null,
      source: "CEC Electric Load Serving Entities (Other)",
      sourceDate: today,
    });

    // Write GeoJSON file
    const geoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            id: regionId,
            name: displayName,
            acronym: props.Acronym,
            eiaId: utility?.eiaId ?? null,
          },
          geometry: feature.geometry,
        },
      ],
    };

    writeTerritory(`${slug}.json`, geoJson);

    // Link utility to region
    if (utility) {
      utility.serviceTerritoryId = regionId;
      matched++;
      console.log(`  ✓ ${cecName} → ${utility.name} (EIA ${utility.eiaId})`);
    } else {
      unmatched++;
      console.log(`  ✗ ${cecName} — no match`);
    }
  }

  // ── 4. Write updated data ──────────────────────────────────────────
  const allRegions = [...filteredRegions, ...newRegions];
  allRegions.sort((a, b) => a.name.localeCompare(b.name));
  writeJSON("regions.json", allRegions);
  console.log(`  ${allRegions.length} regions (+${newRegions.length} CCA)`);

  writeJSON("utilities.json", utilities);
  console.log(`  Updated utilities — ${matched} CCA territories linked`);

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\nSync complete:");
  console.log(`  CCA territories fetched: ${ccaFeatures.length}`);
  console.log(`  Matched to utilities: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  Total regions: ${allRegions.length}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
