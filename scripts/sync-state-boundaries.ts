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
 *   - territories and spatial history via applySync, in the same transaction
 * Bookkeeping:
 *   - data/state-boundaries/manifest.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { getPooledDb } from "@/lib/db/client-pooled";
import { applySync, type SyncRecord } from "@/lib/sync/apply-sync";
import { DATA_DIR, slugify } from "./lib";
import { VERMONT_UTILITY_EIA_IDS } from "./lib/vermont-utility-crosswalk";

const SERVICE_TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

const PAGE_SIZE = 2000;
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
   * True when this row represents a state agency boundary. Unmatched lower-
   * precedence records are retained; absence is never inferred retirement.
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
  selected_states: string[];
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
    enabled: true, // Source visually validated by maintainer; see source documentation.
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
    if (seenIds.has(record.id)) {
      if (config.eiaIdByName) throw new Error(`Duplicate utility polygon: ${record.id}`);
      continue;
    }
    seenIds.add(record.id);
    entries.push({ record, geometry: feature.geometry });
  }
  if (config.eiaIdByName) {
    const expected = new Set(Object.values(config.eiaIdByName));
    const actual = new Set(entries.map(({ record }) => record.eiaId));
    if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
      throw new Error(`Incomplete utility coverage for ${config.sourceId}`);
    }
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
        // Missing source data is not an instruction to erase another source's count.
        customers: record.customers ?? undefined,
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
      outSR: "4326",
      resultOffset: String(resultOffset),
      resultRecordCount: String(PAGE_SIZE),
    });

    const pageUrl = `${config.url}?${params}`;
    const page = (await fetchJsonWithFallback(pageUrl, undefined, fetchImpl)) as FeatureCollection<Geometry, P>;
    if (page.type !== "FeatureCollection" || !Array.isArray(page.features)) {
      throw new Error(`Invalid GeoJSON response for ${config.sourceId}`);
    }
    const features = page.features;
    allFeatures.push(...features);

    const more = (page as FeatureCollection & { exceededTransferLimit?: boolean }).exceededTransferLimit;
    if (more && features.length === 0) throw new Error(`Empty truncated page for ${config.sourceId}`);
    if (!more && features.length < PAGE_SIZE) break;
    resultOffset += features.length;
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
    if (page.type !== "FeatureCollection" || !Array.isArray(page.features)) {
      throw new Error(`Invalid GeoJSON response for ${config.sourceId}`);
    }
    const features = page.features;
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

export function buildTerritorySyncRecords(entries: RegionEntry[]): SyncRecord[] {
  return entries.map(({ record, geometry }) => {
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      throw new Error(`Non-polygon territory: ${record.id}`);
    }
    return {
      entityId: record.eiaId ? `territory-${record.eiaId}` : record.id.replace(/^region-/, "territory-"),
      sourceId: record.dataSourceId,
      asOf: record.sourceDate ? new Date(record.sourceDate) : null,
      fields: { regionId: record.id, source: record.source, sourceUrl: record.sourceUrl },
      geography: geometry,
    };
  });
}

export async function publishToDatabase(entries: RegionEntry[]): Promise<PublishResult> {
  const db = getPooledDb();
  return db.transaction(async (tx) => {
    // Serialize publishers, including concurrent creates where FOR UPDATE has no row.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sync:state-boundaries'))`);
    const vtIds = [
      ...new Set(entries.filter(({ record }) => record.dataSourceId === "vt-psd").map(({ record }) => record.eiaId)),
    ];
    if (vtIds.length) {
      const result = await tx.execute(sql`SELECT eia_id FROM utilities
        WHERE deleted_at IS NULL AND jurisdiction = 'VT' AND service_territory_id = 'region-st-' || eia_id AND eia_id IN (${sql.join(
          vtIds.map((id) => sql`${id}`),
          sql`, `
        )})`);
      const found = new Set(result.rows.map((r) => r.eia_id));
      if (vtIds.some((id) => !id || !found.has(id)))
        throw new Error("Vermont crosswalk references missing utility records");
    }
    const regionIds = entries.map(({ record }) => sql`${record.id}`);
    if (regionIds.length) {
      const protectedRows = await tx.execute(sql`SELECT id, locked_status, deleted_at FROM regions
        WHERE id IN (${sql.join(regionIds, sql`, `)}) ORDER BY id FOR UPDATE`);
      if (protectedRows.rows.some((row) => row.locked_status || row.deleted_at))
        throw new Error("Locked or retired region requires manual review");
    }
    const report = await applySync(buildRegionSyncRecords(entries), {
      entityType: "region",
      initiatedBy: RUNNER_ACTOR,
      batchTitle: "State service territory metadata sync",
      tx,
    });
    const spatial = await applySync(buildTerritorySyncRecords(entries), {
      entityType: "territory",
      initiatedBy: RUNNER_ACTOR,
      batchTitle: "State service territory boundary sync",
      tx,
    });
    // Never commit region attribution independently of a deferred boundary.
    if (spatial.deferrals.length || report.deferrals.length) {
      throw new Error("Human-edited boundary or metadata deferred; publication rolled back for review");
    }
    return {
      created: report.created,
      updated: report.updated,
      unchanged: report.unchanged,
      fieldsWritten: report.fieldsWritten + spatial.fieldsWritten,
      deferrals: [],
      territoriesUpserted: spatial.created + spatial.updated,
      // Absence is not evidence of replacement. Preserve unmatched HIFLD coverage.
      hifldSuperseded: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function writeManifest(report: SyncReport, sourceResults: SourceResult[], sources: SourceConfig[]): void {
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
    selected_states: [...new Set(sources.map((source) => source.state))],
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
      "Region metadata, territory geometries, history, and changelog are committed atomically for selected states.",
      "Invalid geometry and protected edits abort publication; unmatched HIFLD coverage is retained.",
      "Re-runs are idempotent (stable region/territory ids) and conflict-aware (applySync policy B leaves human-edited fields untouched).",
    ],
  };

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  Wrote ${path.relative(DATA_DIR, MANIFEST_PATH)}`);
}

export interface RunOptions {
  fetchImpl?: Fetcher;
  /** Omit to run every enabled state; an explicit list must be nonempty and supported. */
  states?: string[];
  skipStates?: string[];
  publish?: boolean;
  writeManifest?: boolean;
}

export function selectBoundarySources(
  options: Pick<RunOptions, "states" | "skipStates">,
  registry: SourceConfig[] = STATE_BOUNDARY_SOURCES
): SourceConfig[] {
  const enabled = registry.filter((source) => source.enabled !== false);
  const supported = new Set(enabled.map((source) => source.state));
  function validate(states: string[]): Set<string> {
    const normalized = states.map((state) => state.trim().toUpperCase());
    if (normalized.some((state) => !supported.has(state))) {
      throw new Error(`Unsupported state selection. Enabled states: ${[...supported].join(", ")}`);
    }
    return new Set(normalized);
  }
  const states = options.states === undefined ? undefined : validate(options.states);
  const skipped = validate(options.skipStates ?? []);
  if (states && (states.size === 0 || [...states].some((state) => skipped.has(state)))) {
    throw new Error("State selection must be nonempty and must not overlap --skip-states");
  }
  return enabled.filter((source) => (!states || states.has(source.state)) && !skipped.has(source.state));
}

export function parseStateBoundaryArgs(args: string[]): Pick<RunOptions, "states" | "skipStates"> {
  const { values } = parseArgs({
    args,
    options: { states: { type: "string" }, "skip-states": { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  return { states: values.states?.split(","), skipStates: values["skip-states"]?.split(",") };
}

export async function syncStateBoundaries(options: RunOptions = {}): Promise<SyncReport> {
  // Validate before any source request or database access; never widen a typo to all states.
  const sources = selectBoundarySources(options);
  const fetchImpl = options.fetchImpl ?? fetch;

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

  console.log(`  Selected states: ${[...new Set(sources.map((source) => source.state))].join(", ")}`);
  for (const config of sources) {
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
    }
  }

  report.fetchedSources = sourceResults.filter((s) => !s.error).length;
  report.fetchedFeatures = sourceResults.reduce((sum, s) => sum + s.features, 0);

  let publishResult: PublishResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    fieldsWritten: 0,
    deferrals: [],
    territoriesUpserted: 0,
    hifldSuperseded: 0,
  };

  if (options.publish !== false && report.errors.length === 0) {
    publishResult = await publishToDatabase(entries);
  }

  report.regionsCreated = publishResult.created;
  report.regionsUpdated = publishResult.updated;
  report.regionsUnchanged = publishResult.unchanged;
  report.fieldsWritten = publishResult.fieldsWritten;
  report.deferralsCount = publishResult.deferrals.length;
  report.territoriesUpserted = publishResult.territoriesUpserted;
  report.hifldSuperseded = publishResult.hifldSuperseded;

  if (options.writeManifest !== false) {
    writeManifest(report, sourceResults, sources);
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

  const report = await syncStateBoundaries(parseStateBoundaryArgs(process.argv.slice(2)));

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
