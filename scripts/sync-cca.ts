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
 * Publishes to Postgres via applySync (source of truth):
 *   - regions table (CCA_TERRITORY region records)
 *   - territories table (CCA boundary geometry)
 *   - utilities table (serviceTerritoryId reference updates only)
 */

import type { Feature, Geometry } from "geojson";
import { getPooledDb } from "@/lib/db/client-pooled";
import { applySync, type SyncRecord } from "@/lib/sync/apply-sync";
import { readJSON, slugify } from "./lib";

const CCA_FEATURE_SERVER_URL =
  "https://services3.arcgis.com/bWPjFyq029ChCGur/arcgis/rest/services/ElectricLoadServingEntities_Other/FeatureServer/0/query";

const CEC_EL_OTHER_SOURCE_ID = "cec-el-other";
const RUNNER_ACTOR = "sync:cca";

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

  const data = (await response.json()) as { features?: Feature<Geometry, CCAProperties>[] };
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

function dedupeByEntityId(records: SyncRecord[]): SyncRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (seen.has(r.entityId)) return false;
    seen.add(r.entityId);
    return true;
  });
}

function toRegionSyncRecords(regions: RegionRecord[]): SyncRecord[] {
  return dedupeByEntityId(
    regions.map((r) => {
      const asOf = r.sourceDate ? new Date(r.sourceDate) : null;
      return {
        sourceId: CEC_EL_OTHER_SOURCE_ID,
        asOf: asOf && !Number.isNaN(asOf.getTime()) ? asOf : null,
        entityId: r.id,
        slug: r.slug,
        fields: {
          name: r.name,
          type: r.type,
          eiaId: r.eiaId,
          state: r.state,
          customers: r.customers,
          source: r.source,
          sourceDate: r.sourceDate,
        },
      };
    })
  );
}

function toTerritorySyncRecords(ccaFeatures: Feature<Geometry, CCAProperties>[]): SyncRecord[] {
  const records: SyncRecord[] = [];

  for (const feature of ccaFeatures) {
    const props = feature.properties;
    if (!props?.Utility) continue;

    const cecName = props.Utility;
    const slug = `cca-${ccaSlugify(cecName)}`;
    const regionId = `region-${slug}`;

    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      console.warn(`  Skipping non-polygon CCA territory: ${slug}`);
      continue;
    }

    records.push({
      entityId: `territory-${slug}`,
      sourceId: CEC_EL_OTHER_SOURCE_ID,
      asOf: null,
      fields: {
        regionId,
        source: "CEC Electric Load Serving Entities (Other)",
        sourceUrl: CCA_FEATURE_SERVER_URL,
      },
      geography: geometry,
    });
  }

  return dedupeByEntityId(records);
}

function toUtilitySyncRecords(
  utilities: UtilityRecord[],
  ccaFeatures: Feature<Geometry, CCAProperties>[],
  existingCCARegionIds: Set<string>
): SyncRecord[] {
  const matched = new Map<string, string>();

  for (const feature of ccaFeatures) {
    const props = feature.properties;
    if (!props?.Utility) continue;

    const cecName = props.Utility;
    const utility = matchCCAToUtility(cecName, utilities);
    if (!utility) continue;

    const slug = `cca-${ccaSlugify(cecName)}`;
    const regionId = `region-${slug}`;
    matched.set(utility.id, regionId);
  }

  const records: SyncRecord[] = [];
  for (const utility of utilities) {
    const originalServiceTerritoryId = utility.serviceTerritoryId;
    const newServiceTerritoryId = matched.get(utility.id) ?? null;

    // Preserve current behavior: only touch utilities whose CCA reference
    // changed. A previously matched CCA that no longer matches is cleared;
    // non-CCA serviceTerritoryIds are left untouched.
    const wasCCA = originalServiceTerritoryId !== null && existingCCARegionIds.has(originalServiceTerritoryId);
    if (!wasCCA && newServiceTerritoryId === null) continue;
    if (originalServiceTerritoryId === newServiceTerritoryId) continue;

    records.push({
      sourceId: CEC_EL_OTHER_SOURCE_ID,
      asOf: null,
      entityId: utility.id,
      slug: utility.slug,
      fields: {
        serviceTerritoryId: newServiceTerritoryId,
      },
    });
  }

  return dedupeByEntityId(records);
}

async function main() {
  console.log("Syncing CCA territories from CEC ArcGIS\n");

  const today = new Date().toISOString().split("T")[0];

  // ── 1. Fetch CCA boundaries ────────────────────────────────────────
  console.log("1. Fetching CCA territory boundaries...");
  const ccaFeatures = await fetchCCAFeatures();
  console.log(`  Fetched ${ccaFeatures.length} CCA territories\n`);

  // ── 2. Load existing data ──────────────────────────────────────────
  const utilities: UtilityRecord[] = readJSON("utilities.json");
  const regions: RegionRecord[] = readJSON("regions.json");

  // Track existing CCA region ids so we can clear stale references without
  // touching non-CCA serviceTerritoryIds.
  const existingCCARegionIds = new Set(regions.filter((r) => r.type === "CCA_TERRITORY").map((r) => r.id));

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

    if (utility) {
      matched++;
      console.log(`  ✓ ${cecName} → ${utility.name} (EIA ${utility.eiaId})`);
    } else {
      unmatched++;
      console.log(`  ✗ ${cecName} — no match`);
    }
  }

  // ── 4. Publish to Postgres ─────────────────────────────────────────
  console.log("\n3. Publishing to Postgres via applySync...");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required — the CCA sync publishes directly to Postgres");
  }

  const regionRecords = toRegionSyncRecords(newRegions);
  const territoryRecords = toTerritorySyncRecords(ccaFeatures);
  const utilityRecords = toUtilitySyncRecords(utilities, ccaFeatures, existingCCARegionIds);

  const db = getPooledDb();
  const reports = await db.transaction(async (tx) => {
    // Order matters for FKs: regions → utilities → territories
    const regionReport = await applySync(regionRecords, {
      entityType: "region",
      initiatedBy: RUNNER_ACTOR,
      batchTitle: "CEC Electric Load Serving Entities — CCA region sync",
      tx,
    });

    const utilityReport = await applySync(utilityRecords, {
      entityType: "utility",
      initiatedBy: RUNNER_ACTOR,
      batchTitle: "CEC Electric Load Serving Entities — CCA utility reference sync",
      tx,
    });

    const territoryReport = await applySync(territoryRecords, {
      entityType: "territory",
      initiatedBy: RUNNER_ACTOR,
      batchTitle: "CEC Electric Load Serving Entities — CCA territory sync",
      tx,
    });

    return { regionReport, utilityReport, territoryReport };
  });

  const totalCreated = reports.regionReport.created + reports.utilityReport.created + reports.territoryReport.created;
  const totalUpdated = reports.regionReport.updated + reports.utilityReport.updated + reports.territoryReport.updated;
  const totalUnchanged =
    reports.regionReport.unchanged + reports.utilityReport.unchanged + reports.territoryReport.unchanged;
  const totalDeferrals =
    reports.regionReport.deferrals.length +
    reports.utilityReport.deferrals.length +
    reports.territoryReport.deferrals.length;

  console.log("  Registry publication complete:");
  console.log(`    Created: ${totalCreated.toLocaleString()}`);
  console.log(`    Updated: ${totalUpdated.toLocaleString()}`);
  console.log(`    Unchanged: ${totalUnchanged.toLocaleString()}`);
  if (totalDeferrals > 0) {
    console.log(`    Deferrals (human-edited fields preserved): ${totalDeferrals.toLocaleString()}`);
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\nSync complete:");
  console.log(`  CCA territories fetched: ${ccaFeatures.length}`);
  console.log(`  Matched to utilities: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  Region records applied: ${regionRecords.length}`);
  console.log(`  Territory records applied: ${territoryRecords.length}`);
  console.log(`  Utility reference updates applied: ${utilityRecords.length}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
