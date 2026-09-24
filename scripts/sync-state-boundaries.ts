/**
 * Sync script: Generic ArcGIS/Socrata state service-territory boundary adapter.
 *
 * Driven by an in-file registry of source configs. Adding a new state should
 * require exactly one registry row plus its field mapping — no new code.
 *
 * Usage:
 *   yarn sync:state-boundaries
 *
 * Outputs:
 *   - data/regions.json — merged Region records
 *   - public/data/territories/{eiaId|slug}.json — per-territory GeoJSON
 */

import * as fs from "node:fs";
import type { Feature, FeatureCollection, Geometry } from "geojson";

// Inlined 2-letter state-code format check to keep this sync script free of the
// un-vendored @texturehq/geography-config dependency (not in package.json; imported only
// by untested sync scripts today). We only validate our own registry `state` codes, so a
// format check (two ASCII letters) is sufficient to reject garbage without hardcoding a
// list that would need maintenance for territories.
function isValidStateCode(code: string): boolean {
  return /^[A-Za-z]{2}$/.test(code);
}

import type { Region } from "@/types/entities";
import { DATA_DIR, readJSON, slugify, TERRITORIES_DIR, writeJSON, writeTerritory } from "./lib";

const SERVICE_TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

const PAGE_SIZE = 2000;
const MAX_ALLOWABLE_OFFSET = 0.005;

export type SourceKind = "arcgis" | "socrata";

export interface FieldMapping {
  /** Source field containing the utility/territory name. */
  name: string;
  /** Source field containing the utility type (IOU, co-op, municipal, …). */
  utilityType?: string;
  /** Optional source field for the EIA utility ID. */
  eiaId?: string;
  /** Optional source field for a stable source-specific identifier. */
  sourceId?: string;
  /** Optional source field for customer count. */
  customers?: string;
}

export interface SourceConfig {
  /** Stable identifier for this source row (used in logs/skip logic). */
  sourceId: string;
  /** Two-letter state code. */
  state: string;
  /** Base query URL (FeatureServer/MapServer query endpoint, or Socrata URL). */
  url: string;
  kind: SourceKind;
  fieldMapping: FieldMapping;
  /** Human-readable source label written to Region.source. */
  sourceLabel: string;
  /** Publication/as-of date for the source dataset (ISO-8601). */
  sourceDate: string;
  /** Optional ArcGIS/Socrata WHERE clause. Defaults to "1=1". */
  where?: string;
  /** Higher number = higher precedence. State agencies outrank HIFLD. */
  sourcePriority?: number;
  /**
   * True when this row represents a state agency boundary. Used to drop lower-
   * precedence (e.g. HIFLD) records for the same state during merging.
   */
  isStateSource?: boolean;
  /** Flag for records that need an open-source replacement. */
  needsOpenSource?: boolean;
}

export interface RegionRecord extends Region {
  sourceUrl?: string | null;
  sourcePriority?: number;
  needsOpenSource?: boolean;
  locked?: boolean;
  utilityType?: string | null;
}

export interface SyncReport {
  fetchedSources: number;
  fetchedFeatures: number;
  writtenRegions: number;
  writtenTerritories: number;
  skippedLocked: Array<{ id: string; name: string; source: string }>;
  removedHifldIds: string[];
  errors: string[];
}

export const STATE_BOUNDARY_SOURCES: SourceConfig[] = [
  // Wisconsin PSC — three separate MapServer layers (muni, IOU, co-op).
  // Direct requests 403; configured to flow through the Firecrawl fallback.
  {
    sourceId: "wi-psc-municipal",
    state: "WI",
    url: "https://maps.psc.wi.gov/server/rest/services/Electric/PSC_ElectricServiceTerritories/MapServer/0/query",
    kind: "arcgis",
    fieldMapping: { name: "UTIL_LAB", utilityType: "Util_Type", sourceId: "PSC_ID" },
    sourceLabel: "WI PSC Electric Service Territories — Municipal",
    sourceDate: "2026-09-24",
    sourcePriority: 100,
    isStateSource: true,
  },
  {
    sourceId: "wi-psc-investor-owned",
    state: "WI",
    url: "https://maps.psc.wi.gov/server/rest/services/Electric/PSC_ElectricServiceTerritories/MapServer/1/query",
    kind: "arcgis",
    fieldMapping: { name: "UTIL_LAB", utilityType: "Util_Type", sourceId: "PSC_ID" },
    sourceLabel: "WI PSC Electric Service Territories — Investor-Owned",
    sourceDate: "2026-09-24",
    sourcePriority: 100,
    isStateSource: true,
  },
  {
    sourceId: "wi-psc-cooperative",
    state: "WI",
    url: "https://maps.psc.wi.gov/server/rest/services/Electric/PSC_ElectricServiceTerritories/MapServer/2/query",
    kind: "arcgis",
    fieldMapping: { name: "UTIL_LAB", utilityType: "Util_Type", sourceId: "PSC_ID" },
    sourceLabel: "WI PSC Electric Service Territories — Cooperative",
    sourceDate: "2026-09-24",
    sourcePriority: 100,
    isStateSource: true,
  },
  // Minnesota Geospatial Commons / MN PUC electric service territories.
  {
    sourceId: "mn-mngeo-eusa",
    state: "MN",
    url: "https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/util_eusa/FeatureServer/0/query",
    kind: "arcgis",
    fieldMapping: { name: "full_name", utilityType: "type", eiaId: "eia_utility_id", sourceId: "mn_utility_id" },
    sourceLabel: "MN Geospatial Commons Electric Utility Service Areas",
    sourceDate: "2026-01-01",
    sourcePriority: 100,
    isStateSource: true,
  },
  // Colorado — sourced from public-domain HIFLD, not the Platts-licensed
  // data.colorado.gov Utilities_Boundaries layer.
  {
    sourceId: "co-hifld",
    state: "CO",
    url: SERVICE_TERRITORIES_URL,
    kind: "arcgis",
    fieldMapping: { name: "NAME", utilityType: "TYPE", eiaId: "ID", sourceId: "ID" },
    sourceLabel: "HIFLD Electric Retail Service Territories — Colorado",
    sourceDate: new Date().toISOString().split("T")[0],
    sourcePriority: 10,
    isStateSource: false,
    needsOpenSource: true,
    where: "STATE='CO'",
  },
];

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no network, no filesystem)
// ---------------------------------------------------------------------------

/**
 * Read a property from a GeoJSON properties bag. Tries an exact match first,
 * then a case-insensitive fallback so layer-specific casing like Util_Type /
 * UTIL_TYPE does not require per-layer code.
 */
export function getProperty<P extends Record<string, unknown>>(props: P, field: string | undefined): unknown {
  if (!field) return undefined;
  if (Object.hasOwn(props, field)) return props[field];
  const lower = field.toLowerCase();
  for (const key of Object.keys(props)) {
    if (key.toLowerCase() === lower) return props[key];
  }
  return undefined;
}

/**
 * Normalize a utility name to the conventions used elsewhere in commongrid.
 */
export function normalizeUtilityName(name: unknown): string {
  if (name == null) return "Unknown";
  return String(name)
    .replace(/\bCO-OP\b/gi, "COOPERATIVE")
    .replace(/\bE M C\b/gi, "EMC")
    .trim();
}

function isRecordProperties(props: unknown): props is Record<string, unknown> {
  return typeof props === "object" && props !== null && !Array.isArray(props);
}

function toInteger(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isHifldLabel(label: string): boolean {
  return /\bHIFLD\b/i.test(label);
}

export function buildRegionRecord(
  config: SourceConfig,
  feature: Feature<Geometry, Record<string, unknown>>,
  index: number
): RegionRecord | null {
  const props = feature.properties;
  if (!isRecordProperties(props)) return null;

  const rawName = getProperty(props, config.fieldMapping.name);
  const name = normalizeUtilityName(rawName);
  if (!name || name === "Unknown") return null;

  const rawEiaId = config.fieldMapping.eiaId ? getProperty(props, config.fieldMapping.eiaId) : null;
  const eiaId = rawEiaId != null ? String(rawEiaId) : null;

  const rawSourceId = config.fieldMapping.sourceId ? getProperty(props, config.fieldMapping.sourceId) : null;
  const sourceId = rawSourceId != null ? String(rawSourceId) : null;

  const rawUtilityType = config.fieldMapping.utilityType ? getProperty(props, config.fieldMapping.utilityType) : null;
  const utilityType = rawUtilityType != null ? String(rawUtilityType) : null;

  const rawCustomers = config.fieldMapping.customers ? getProperty(props, config.fieldMapping.customers) : null;
  const customers = rawCustomers != null ? toInteger(rawCustomers) : null;

  const state = isValidStateCode(config.state) ? config.state : null;

  const id = eiaId
    ? `region-st-${eiaId}`
    : `region-st-${config.state.toLowerCase()}-${slugify(name)}-${sourceId ?? index}`;
  const slug = eiaId
    ? `st-${slugify(name)}-${eiaId}`
    : `st-${config.state.toLowerCase()}-${slugify(name)}-${sourceId ?? index}`;

  const sourcePriority = config.sourcePriority ?? (config.needsOpenSource ? 10 : 100);

  return {
    id,
    slug,
    name,
    type: "SERVICE_TERRITORY",
    eiaId,
    state,
    customers,
    source: config.sourceLabel,
    sourceUrl: config.url,
    sourceDate: config.sourceDate,
    sourcePriority,
    needsOpenSource: config.needsOpenSource ?? false,
    utilityType,
  };
}

export function buildRegionsFromFeatures(
  config: SourceConfig,
  features: Feature<Geometry, Record<string, unknown>>[]
): RegionRecord[] {
  const records: RegionRecord[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < features.length; i++) {
    const record = buildRegionRecord(config, features[i], i);
    if (!record) continue;
    // Deduplicate by id within a single source; keep first occurrence.
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    records.push(record);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Fetch layer with Firecrawl fallback
// ---------------------------------------------------------------------------

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Fetch JSON from a URL, falling back to Firecrawl on 403/timeout/network
 * errors. Preserves the full query string so ArcGIS pagination continues to
 * work through the fallback.
 */
export async function fetchJsonWithFallback(
  url: string,
  init: RequestInit | undefined,
  fetchImpl: Fetcher
): Promise<unknown> {
  let directError: Error | undefined;

  try {
    const direct = await fetchImpl(url, init);
    if (direct.ok) {
      const text = await direct.text();
      return JSON.parse(text);
    }
    directError = new Error(`Direct fetch failed: ${direct.status} ${direct.statusText}`);
    // Only fall back for blocks, timeouts, or rate limits.
    if (direct.status !== 403 && direct.status !== 408 && direct.status !== 429) {
      throw directError;
    }
  } catch (err) {
    directError = err instanceof Error ? err : new Error(String(err));
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    const reason = directError ? `: ${directError.message}` : "";
    throw new Error(`Direct fetch failed and FIRECRAWL_API_KEY is not set, cannot fall back${reason}`);
  }

  const firecrawlRes = await fetchImpl("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({ url, formats: ["rawHtml"], timeout: 45000 }),
  });

  if (!firecrawlRes.ok) {
    throw new Error(`Firecrawl request failed: ${firecrawlRes.status} ${firecrawlRes.statusText}`);
  }

  const firecrawlJson = (await firecrawlRes.json()) as { data?: { rawHtml?: string } };
  const rawHtml = firecrawlJson.data?.rawHtml;
  if (!rawHtml) {
    throw new Error("Firecrawl response contained no rawHtml");
  }

  return JSON.parse(rawHtml);
}

/**
 * Paginate an ArcGIS FeatureServer/MapServer query endpoint returning GeoJSON.
 */
export async function fetchPaginatedArcGIS<P>(
  config: SourceConfig,
  fetchImpl: Fetcher
): Promise<Feature<Geometry, P>[]> {
  const allFeatures: Feature<Geometry, P>[] = [];
  const outFields = [
    config.fieldMapping.name,
    config.fieldMapping.utilityType,
    config.fieldMapping.eiaId,
    config.fieldMapping.sourceId,
    config.fieldMapping.customers,
  ]
    .filter(Boolean)
    .join(",");

  let resultOffset = 0;
  while (true) {
    const params = new URLSearchParams({
      where: config.where ?? "1=1",
      outFields,
      f: "geojson",
      resultOffset: String(resultOffset),
      resultRecordCount: String(PAGE_SIZE),
      maxAllowableOffset: String(MAX_ALLOWABLE_OFFSET),
    });

    const pageUrl = `${config.url}?${params}`;
    const page = (await fetchJsonWithFallback(pageUrl, undefined, fetchImpl)) as FeatureCollection<Geometry, P>;
    const features = page.features ?? [];
    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) break;
    resultOffset += PAGE_SIZE;
  }

  return allFeatures;
}

/**
 * Paginate a Socrata GeoJSON endpoint using $limit/$offset.
 */
export async function fetchPaginatedSocrata<P>(
  config: SourceConfig,
  fetchImpl: Fetcher
): Promise<Feature<Geometry, P>[]> {
  const allFeatures: Feature<Geometry, P>[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    });
    if (config.where) params.set("$where", config.where);

    const pageUrl = `${config.url}?${params}`;
    const page = (await fetchJsonWithFallback(pageUrl, undefined, fetchImpl)) as FeatureCollection<Geometry, P>;
    const features = page.features ?? [];
    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allFeatures;
}

export async function fetchSource(
  config: SourceConfig,
  fetchImpl: Fetcher
): Promise<Feature<Geometry, Record<string, unknown>>[]> {
  if (config.kind === "socrata") {
    return fetchPaginatedSocrata<Record<string, unknown>>(config, fetchImpl);
  }
  return fetchPaginatedArcGIS<Record<string, unknown>>(config, fetchImpl);
}

// ---------------------------------------------------------------------------
// Merge / precedence / geometry-lock
// ---------------------------------------------------------------------------

export interface MergeResult {
  regions: RegionRecord[];
  changedIds: Set<string>;
  skippedLocked: Array<{ id: string; name: string; source: string }>;
  removedHifldIds: string[];
}

/**
 * Merge fetched region records into the existing regions.json array.
 *
 * Rules:
 *   - Locked records are never overwritten.
 *   - Higher sourcePriority wins over lower sourcePriority.
 *   - State sources additionally outrank HIFLD for the same state, so lower-
 *     precedence in-state records are removed even when IDs do not match
 *     (e.g. Wisconsin, which has no EIA ID in the PSC layer).
 */
export function mergeRegionRecords(
  existing: RegionRecord[],
  incoming: RegionRecord[],
  stateSources: Map<string, number>
): MergeResult {
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const changedIds = new Set<string>();
  const skippedLocked: Array<{ id: string; name: string; source: string }> = [];

  for (const region of incoming) {
    const current = existingById.get(region.id);
    if (current?.locked) {
      skippedLocked.push({ id: current.id, name: current.name, source: current.source ?? "unknown" });
      continue;
    }

    const currentPriority = current?.sourcePriority ?? 0;
    if (current && currentPriority >= (region.sourcePriority ?? 0)) {
      // Existing record has equal or higher precedence — keep it.
      continue;
    }

    existingById.set(region.id, region);
    changedIds.add(region.id);
  }

  // Remove lower-precedence in-state HIFLD records when a state source is
  // present. This is intentionally conservative: we only drop records that are
  // not locked and that are clearly from HIFLD.
  const removedHifldIds: string[] = [];
  for (const [state, statePriority] of stateSources.entries()) {
    for (const [id, region] of existingById.entries()) {
      if (region.state !== state) continue;
      if (region.locked) continue;
      if (changedIds.has(id)) continue; // already replaced by state source
      const regionPriority = region.sourcePriority ?? 0;
      if (regionPriority < statePriority && isHifldLabel(region.source ?? "")) {
        existingById.delete(id);
        removedHifldIds.push(id);
      }
    }
  }

  // Preserve insertion order (existing records first, in their original order,
  // with in-place replacements; any purely-new incoming records appended).
  // Downstream consumers sort for display; the sync output stays stable/diff-friendly.
  const regions = Array.from(existingById.values());

  return { regions, changedIds, skippedLocked, removedHifldIds };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

export function territoryFileKey(record: RegionRecord): string {
  return record.eiaId ? `${record.eiaId}.json` : `${record.slug}.json`;
}

export function writeTerritoryGeoJSON(record: RegionRecord, geometry: Geometry): void {
  const geoJson: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: record.id,
          name: record.name,
          eiaId: record.eiaId,
          state: record.state,
          source: record.source,
          sourceDate: record.sourceDate,
        },
        geometry,
      },
    ],
  };

  fs.mkdirSync(TERRITORIES_DIR, { recursive: true });
  writeTerritory(territoryFileKey(record), geoJson);
}

export interface RunOptions {
  fetchImpl?: Fetcher;
  existingRegions?: RegionRecord[];
  writeFiles?: boolean;
  skipStates?: string[];
}

export async function syncStateBoundaries(options: RunOptions = {}): Promise<SyncReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const existing: RegionRecord[] = options.existingRegions ?? readJSON<RegionRecord[]>("regions.json");
  const skipStates = new Set((options.skipStates ?? []).map((s) => s.toUpperCase()));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TERRITORIES_DIR, { recursive: true });

  const report: SyncReport = {
    fetchedSources: 0,
    fetchedFeatures: 0,
    writtenRegions: 0,
    writtenTerritories: 0,
    skippedLocked: [],
    removedHifldIds: [],
    errors: [],
  };

  const incoming: Array<{ record: RegionRecord; geometry: Geometry }> = [];
  const stateSourcePriorities = new Map<string, number>();

  for (const config of STATE_BOUNDARY_SOURCES) {
    if (skipStates.has(config.state)) continue;

    console.log(`  Fetching ${config.sourceLabel}...`);
    try {
      const features = await fetchSource(config, fetchImpl);
      report.fetchedSources++;
      report.fetchedFeatures += features.length;
      console.log(`    ${features.length} features`);

      const records = buildRegionsFromFeatures(config, features);
      for (let i = 0; i < records.length; i++) {
        incoming.push({ record: records[i], geometry: features[i].geometry });
      }

      if (config.isStateSource && records.length > 0) {
        const currentPriority = stateSourcePriorities.get(config.state) ?? 0;
        stateSourcePriorities.set(config.state, Math.max(currentPriority, config.sourcePriority ?? 100));
      }
    } catch (err) {
      const message = `Failed to fetch ${config.sourceLabel}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`    ⚠️ ${message}`);
      report.errors.push(message);
    }
  }

  const merge = mergeRegionRecords(
    existing,
    incoming.map((i) => i.record),
    stateSourcePriorities
  );
  report.skippedLocked.push(...merge.skippedLocked);
  report.removedHifldIds.push(...merge.removedHifldIds);

  // Write territory GeoJSON for every changed/added record.
  const changedById = new Set(merge.changedIds);
  for (const { record, geometry } of incoming) {
    if (!changedById.has(record.id)) continue;
    if (record.type !== "SERVICE_TERRITORY") continue;
    if (!geometry) continue;

    if (options.writeFiles !== false) {
      writeTerritoryGeoJSON(record, geometry);
    }
    report.writtenTerritories++;
  }

  if (options.writeFiles !== false) {
    writeJSON("regions.json", merge.regions);
    report.writtenRegions = merge.regions.length;
  }

  return report;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function isDirectInvocation(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("sync-state-boundaries.ts") || entry.endsWith("sync-state-boundaries.js");
}

async function main() {
  console.log("Syncing state service territory boundaries\n");

  const skipStatesFlag = process.argv.find((arg) => arg.startsWith("--skip-states="));
  const skipStates = skipStatesFlag ? skipStatesFlag.split("=")[1]?.split(",") : undefined;

  const report = await syncStateBoundaries({ skipStates });

  console.log("\nSync complete:");
  console.log(`  Sources fetched: ${report.fetchedSources}`);
  console.log(`  Features fetched: ${report.fetchedFeatures}`);
  console.log(`  Regions written: ${report.writtenRegions}`);
  console.log(`  Territories written: ${report.writtenTerritories}`);
  console.log(`  Locked records skipped: ${report.skippedLocked.length}`);
  console.log(`  HIFLD records removed by state precedence: ${report.removedHifldIds.length}`);

  if (report.skippedLocked.length > 0) {
    console.log("\n  Skipped locked records:");
    for (const r of report.skippedLocked.slice(0, 10)) {
      console.log(`    - ${r.name} (${r.id})`);
    }
  }

  if (report.errors.length > 0) {
    console.log("\n  Errors:");
    for (const e of report.errors) {
      console.log(`    - ${e}`);
    }
    process.exit(1);
  }
}

if (isDirectInvocation()) {
  main().catch((err) => {
    console.error("State boundary sync failed:", err);
    process.exit(1);
  });
}
