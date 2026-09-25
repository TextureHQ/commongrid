/**
 * Sync script: Generic ArcGIS/Socrata state service-territory boundary adapter.
 *
 * Driven by an in-file registry of source configs. Adding a new state should
 * require exactly one registry row plus its field mapping — no new code.
 *
 * Usage:
 *   yarn sync:state-boundaries
 *
 * Publishes to Postgres:
 *   - regions table via applySync (entityType "region")
 *   - territories table via PostGIS upsert
 * Bookkeeping:
 *   - data/state-boundaries/manifest.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { getPooledDb } from "@/lib/db/client-pooled";
import { applySync, type SyncRecord } from "@/lib/sync/apply-sync";
import { DATA_DIR, slugify } from "./lib";
import { VERMONT_UTILITY_EIA_IDS } from "./lib/vermont-utility-crosswalk";

const SERVICE_TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

const PAGE_SIZE = 2000;
const MAX_ALLOWABLE_OFFSET = 0.005;
const MANIFEST_DIR = path.join(DATA_DIR, "state-boundaries");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.json");
const RUNNER_ACTOR = "sync:state-boundaries";

// Inlined 2-letter state-code format check to keep this sync script free of the
// un-vendored @texturehq/geography-config dependency (not in package.json; imported only
// by untested sync scripts today). We only validate our own registry `state` codes, so a
// format check (two ASCII letters) is sufficient to reject garbage without hardcoding a
// list that would need maintenance for territories.
function isValidStateCode(code: string): boolean {
  return /^[A-Za-z]{2}$/.test(code);
}

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
  /** Registered data_sources.id used for version provenance. */
  dataSourceId: string;
  /** Two-letter state code. */
  state: string;
  /** Base query URL (FeatureServer/MapServer query endpoint, or Socrata URL). */
  url: string;
  kind: SourceKind;
  /** False until source licensing, vintage, and mapping validation are complete. */
  enabled?: boolean;
  /** Exact source-name crosswalk; missing names fail rather than fuzzy-match. */
  eiaIdByName?: Readonly<Record<string, string>>;
  fieldMapping: FieldMapping;
  /** Human-readable source label written to Region.source. */
  sourceLabel: string;
  /** Publication/as-of date for the source dataset (ISO-8601). */
  sourceDate: string | null;
  /** Optional ArcGIS/Socrata WHERE clause. Defaults to "1=1". */
  where?: string;
  /** Higher number = higher precedence. State agencies outrank HIFLD. */
  sourcePriority?: number;
  /**
   * True when this row represents a state agency boundary. Used to drop lower-
   * precedence (e.g. HIFLD) records for the same state after writing.
   */
  isStateSource?: boolean;
  /** Flag for records that need an open-source replacement. */
  needsOpenSource?: boolean;
}

export interface RegionRecord {
  id: string;
  slug: string;
  name: string;
  type: "SERVICE_TERRITORY";
  eiaId: string | null;
  state: string | null;
  customers: number | null;
  source: string;
  sourceUrl: string | null;
  sourceDate: string | null;
  dataSourceId: string;
  sourcePriority?: number;
  needsOpenSource?: boolean;
  utilityType?: string | null;
}

export interface RegionEntry {
  record: RegionRecord;
  geometry: Geometry;
}

export interface SyncReport {
  fetchedSources: number;
  fetchedFeatures: number;
  regionsCreated: number;
  regionsUpdated: number;
  regionsUnchanged: number;
  fieldsWritten: number;
  deferralsCount: number;
  territoriesUpserted: number;
  hifldSuperseded: number;
  errors: string[];
}

interface SourceResult {
  sourceId: string;
  sourceLabel: string;
  features: number;
  entries: number;
  error?: string;
}

interface Manifest {
  source: string;
  generated_by: string;
  generated_at: string;
  source_results: SourceResult[];
  region_counts: {
    created: number;
    updated: number;
    unchanged: number;
    fields_written: number;
  };
  territories_upserted: number;
  hifld_superseded: number;
  deferrals_count: number;
  needs_open_source: string[];
  errors: string[];
  notes: string[];
}

export const STATE_BOUNDARY_SOURCES: SourceConfig[] = [
  {
    sourceId: "vt-psd-electric",
    dataSourceId: "vt-psd",
    state: "VT",
    url: "https://maps.vcgi.vermont.gov/arcgis/rest/services/PSD_services/PSD_Published_Layers/MapServer/0/query",
    kind: "arcgis",
    enabled: false, // Release gates: docs/data-sources/vermont-territories.md
    fieldMapping: { name: "COMPANYNAM", sourceId: "OBJECTID" },
    eiaIdByName: VERMONT_UTILITY_EIA_IDS,
    sourceLabel: "Vermont PSD Electric Utility Service Territories (2015 compilation)",
    sourceDate: null, // Metadata gives only the compilation year, not an as-of date.
    sourcePriority: 100,
    isStateSource: true,
  },
  // Wisconsin PSC — three separate MapServer layers (muni, IOU, co-op).
  // Direct requests 403; configured to flow through the Firecrawl fallback.
  {
    sourceId: "wi-psc-municipal",
    dataSourceId: "wi-psc",
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
    dataSourceId: "wi-psc",
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
    dataSourceId: "wi-psc",
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
    dataSourceId: "mn-gisdata",
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
    dataSourceId: "hifld-rsts",
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
  const sourceName = String(rawName ?? "").trim();
  const mappedEiaId =
    config.eiaIdByName && Object.hasOwn(config.eiaIdByName, sourceName) ? config.eiaIdByName[sourceName] : undefined;
  if (config.eiaIdByName && !mappedEiaId) {
    throw new Error(`${config.sourceId}: unmapped utility name "${sourceName}"`);
  }
  const eiaId = mappedEiaId ?? (rawEiaId != null ? String(rawEiaId) : null);

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
    dataSourceId: config.dataSourceId,
    sourcePriority: config.sourcePriority ?? (config.needsOpenSource ? 10 : 100),
    needsOpenSource: config.needsOpenSource ?? false,
    utilityType,
  };
}

export function buildRegionsFromFeatures(
  config: SourceConfig,
  features: Feature<Geometry, Record<string, unknown>>[]
): RegionEntry[] {
  const entries: RegionEntry[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const record = buildRegionRecord(config, feature, i);
    if (!record) continue;
    // Deduplicate by id within a single source; keep first occurrence.
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    entries.push({ record, geometry: feature.geometry });
  }
  return entries;
}

/**
 * Map fetched region entries to applySync records. Fields are limited to real
 * regions table content columns; bookkeeping/internal flags are excluded.
 */
export function buildRegionSyncRecords(entries: RegionEntry[]): SyncRecord[] {
  return entries.map(({ record }) => {
    const asOf = record.sourceDate ? new Date(record.sourceDate) : null;
    return {
      sourceId: record.dataSourceId,
      asOf: asOf && !Number.isNaN(asOf.getTime()) ? asOf : null,
      entityId: record.id,
      slug: record.slug,
      fields: pruneUndefined({
        name: record.name,
        type: record.type,
        eiaId: record.eiaId,
        state: record.state,
        customers: record.customers,
        source: record.source,
        sourceUrl: record.sourceUrl,
        sourceDate: record.sourceDate,
      }),
    };
  });
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
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
// Database publication
// ---------------------------------------------------------------------------

interface PublishResult {
  created: number;
  updated: number;
  unchanged: number;
  fieldsWritten: number;
  deferrals: Array<{ entityId: string; field: string; keptValue: unknown; skippedValue: unknown }>;
  territoriesUpserted: number;
  hifldSuperseded: number;
}

async function publishToDatabase(
  entries: RegionEntry[],
  successfulStateSourceStates: Set<string>
): Promise<PublishResult> {
  const empty: PublishResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    fieldsWritten: 0,
    deferrals: [],
    territoriesUpserted: 0,
    hifldSuperseded: 0,
  };

  if (!process.env.DATABASE_URL) {
    console.warn(
      "\n⚠️  DATABASE_URL is not set — skipping database publication. " +
        "The manifest is still written; regions and territories are NOT updated."
    );
    return empty;
  }

  const regionRecords = buildRegionSyncRecords(entries);

  console.log("\nPublishing state service-territory boundaries to Postgres...");
  const report = await applySync(regionRecords, {
    entityType: "region",
    initiatedBy: RUNNER_ACTOR,
    batchTitle: "State service-territory boundary sync",
    batchDescription: `WI + MN state sources + CO via HIFLD — ${regionRecords.length} territories`,
  });

  const db = getPooledDb();
  let territoriesUpserted = 0;

  for (const { record, geometry } of entries) {
    if (!geometry) continue;

    const geojsonStr = JSON.stringify(geometry);
    const territoryId = record.eiaId ? `territory-${record.eiaId}` : record.id.replace(/^region-/, "territory-");
    const source = isHifldLabel(record.source) ? "HIFLD ArcGIS" : record.source;
    const sourceUrl = record.sourceUrl;

    const res = await db.execute(sql`
      INSERT INTO territories (id, region_id, geography, source, source_url)
      VALUES (
        ${territoryId},
        ${record.id},
        ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geojsonStr})), 3))::geography,
        ${source},
        ${sourceUrl}
      )
      ON CONFLICT (id) DO UPDATE SET
        geography = EXCLUDED.geography,
        source = EXCLUDED.source,
        source_url = EXCLUDED.source_url
      RETURNING id
    `);

    if ((res.rows as unknown[]).length > 0) {
      territoriesUpserted++;
    }
  }

  // After writing state-source regions for a state where every configured
  // state source succeeded, soft-delete any in-state HIFLD rows that were not
  // part of this sync. Locked rows are never retired.
  let hifldSuperseded = 0;
  const idsByState = new Map<string, string[]>();
  for (const { record } of entries) {
    if (!record.state) continue;
    if (!successfulStateSourceStates.has(record.state)) continue;
    const list = idsByState.get(record.state) ?? [];
    list.push(record.id);
    idsByState.set(record.state, list);
  }

  for (const state of successfulStateSourceStates) {
    const ids = idsByState.get(state) ?? [];
    if (ids.length === 0) continue;

    const idArray = sql`ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )}]`;

    const res = await db.execute(sql`
      UPDATE regions
      SET deleted_at = now()
      WHERE state = ${state}
        AND deleted_at IS NULL
        AND source ILIKE ${"%HIFLD%"}
        AND locked_status IS NULL
        AND id <> ALL (${idArray})
      RETURNING id
    `);

    hifldSuperseded += (res.rows as unknown[]).length;
  }

  console.log("  Publication complete:");
  console.log(`    Batch id: ${report.batchId}`);
  console.log(`    Created: ${report.created.toLocaleString()}`);
  console.log(`    Updated: ${report.updated.toLocaleString()}`);
  console.log(`    Unchanged: ${report.unchanged.toLocaleString()}`);
  console.log(`    Fields written: ${report.fieldsWritten.toLocaleString()}`);
  console.log(`    Territories upserted: ${territoriesUpserted.toLocaleString()}`);
  console.log(`    HIFLD superseded: ${hifldSuperseded.toLocaleString()}`);

  if (report.deferrals.length > 0) {
    console.log(
      `    ⚠️  Deferred ${report.deferrals.length.toLocaleString()} field(s) a human last edited (policy B — not overwritten):`
    );
    for (const d of report.deferrals.slice(0, 20)) {
      console.log(
        `      - ${d.entityId} field '${d.field}': kept ${JSON.stringify(d.keptValue)}, sync wanted ${JSON.stringify(d.skippedValue)}`
      );
    }
    if (report.deferrals.length > 20) {
      console.log(`      … and ${(report.deferrals.length - 20).toLocaleString()} more`);
    }
  }

  return {
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    fieldsWritten: report.fieldsWritten,
    deferrals: report.deferrals,
    territoriesUpserted,
    hifldSuperseded,
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function writeManifest(report: SyncReport, sourceResults: SourceResult[]): void {
  const needsOpenSource: string[] = [];
  for (const result of sourceResults) {
    if (result.error) continue;
    const config = STATE_BOUNDARY_SOURCES.find((c) => c.sourceId === result.sourceId);
    if (config?.needsOpenSource) {
      needsOpenSource.push(`${config.sourceLabel} (${result.entries} entries)`);
    }
  }

  const manifest: Manifest = {
    source: "State service-territory boundary sync",
    generated_by: RUNNER_ACTOR,
    generated_at: new Date().toISOString(),
    source_results: sourceResults,
    region_counts: {
      created: report.regionsCreated,
      updated: report.regionsUpdated,
      unchanged: report.regionsUnchanged,
      fields_written: report.fieldsWritten,
    },
    territories_upserted: report.territoriesUpserted,
    hifld_superseded: report.hifldSuperseded,
    deferrals_count: report.deferralsCount,
    needs_open_source: needsOpenSource,
    errors: report.errors,
    notes: [
      "Regions are published via applySync (entityType 'region') to the Postgres registry.",
      "Territory geometries are upserted separately via PostGIS (ST_MakeValid / ST_Multi).",
      "HIFLD in-state rows are soft-deleted only after a higher-precedence state source is written, and only when the row is not human-locked.",
      "Re-runs are idempotent (stable region/territory ids) and conflict-aware (applySync policy B leaves human-edited fields untouched).",
    ],
  };

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  Wrote ${path.relative(DATA_DIR, MANIFEST_PATH)}`);
}

export interface RunOptions {
  fetchImpl?: Fetcher;
  skipStates?: string[];
  publish?: boolean;
  writeManifest?: boolean;
}

export async function syncStateBoundaries(options: RunOptions = {}): Promise<SyncReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const skipStates = new Set((options.skipStates ?? []).map((s) => s.toUpperCase()));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });

  const report: SyncReport = {
    fetchedSources: 0,
    fetchedFeatures: 0,
    regionsCreated: 0,
    regionsUpdated: 0,
    regionsUnchanged: 0,
    fieldsWritten: 0,
    deferralsCount: 0,
    territoriesUpserted: 0,
    hifldSuperseded: 0,
    errors: [],
  };

  const entries: RegionEntry[] = [];
  const sourceResults: SourceResult[] = [];

  const stateSourceConfigsByState = new Map<string, number>();
  const stateSourceSuccessByState = new Map<string, number>();
  for (const config of STATE_BOUNDARY_SOURCES) {
    if (config.enabled === false || skipStates.has(config.state) || !config.isStateSource) continue;
    stateSourceConfigsByState.set(config.state, (stateSourceConfigsByState.get(config.state) ?? 0) + 1);
  }

  for (const config of STATE_BOUNDARY_SOURCES) {
    if (config.enabled === false || skipStates.has(config.state)) continue;

    console.log(`  Fetching ${config.sourceLabel}...`);
    try {
      const features = await fetchSource(config, fetchImpl);
      const sourceEntries = buildRegionsFromFeatures(config, features);
      entries.push(...sourceEntries);
      sourceResults.push({
        sourceId: config.sourceId,
        sourceLabel: config.sourceLabel,
        features: features.length,
        entries: sourceEntries.length,
      });
      if (config.isStateSource) {
        stateSourceSuccessByState.set(config.state, (stateSourceSuccessByState.get(config.state) ?? 0) + 1);
      }
      console.log(`    ${features.length} features → ${sourceEntries.length} entries`);
    } catch (err) {
      const message = `Failed to fetch ${config.sourceLabel}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`    ⚠️ ${message}`);
      report.errors.push(message);
      sourceResults.push({
        sourceId: config.sourceId,
        sourceLabel: config.sourceLabel,
        features: 0,
        entries: 0,
        error: message,
      });
      if (config.isStateSource) {
        // Failed state sources do not count toward success; the supersede
        // step will skip this state entirely.
        stateSourceSuccessByState.set(config.state, stateSourceSuccessByState.get(config.state) ?? 0);
      }
    }
  }

  report.fetchedSources = sourceResults.filter((s) => !s.error).length;
  report.fetchedFeatures = sourceResults.reduce((sum, s) => sum + s.features, 0);

  const successfulStateSourceStates = new Set<string>();
  for (const [state, total] of stateSourceConfigsByState.entries()) {
    if (stateSourceSuccessByState.get(state) === total) {
      successfulStateSourceStates.add(state);
    }
  }

  let publishResult: PublishResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    fieldsWritten: 0,
    deferrals: [],
    territoriesUpserted: 0,
    hifldSuperseded: 0,
  };

  if (options.publish !== false) {
    publishResult = await publishToDatabase(entries, successfulStateSourceStates);
  }

  report.regionsCreated = publishResult.created;
  report.regionsUpdated = publishResult.updated;
  report.regionsUnchanged = publishResult.unchanged;
  report.fieldsWritten = publishResult.fieldsWritten;
  report.deferralsCount = publishResult.deferrals.length;
  report.territoriesUpserted = publishResult.territoriesUpserted;
  report.hifldSuperseded = publishResult.hifldSuperseded;

  if (options.writeManifest !== false) {
    writeManifest(report, sourceResults);
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
  console.log(`  Regions created: ${report.regionsCreated}`);
  console.log(`  Regions updated: ${report.regionsUpdated}`);
  console.log(`  Regions unchanged: ${report.regionsUnchanged}`);
  console.log(`  Fields written: ${report.fieldsWritten}`);
  console.log(`  Deferrals: ${report.deferralsCount}`);
  console.log(`  Territories upserted: ${report.territoriesUpserted}`);
  console.log(`  HIFLD records superseded: ${report.hifldSuperseded}`);

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
