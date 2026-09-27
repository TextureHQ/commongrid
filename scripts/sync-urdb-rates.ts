/**
 * Sync script: OpenEI Utility Rate Database (URDB) → rate_structures registry.
 *
 * Ingests approved, currently-effective residential + commercial rate schedules
 * for utilities already present in the CommonGrid registry. URDB records are
 * mapped to SyncRecord rows and published via applySync (entityType
 * "rate_structure"). The workflow commits only the run manifest; no data JSON
 * is checked in.
 *
 * Usage:
 *   npx tsx scripts/sync-urdb-rates.ts [--dry-run]
 *
 * Output:
 *   data/urdb-rates/manifest.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isNotNull } from "drizzle-orm";
import { getPooledDb } from "@/lib/db/client-pooled";
import { regions, utilities } from "@/lib/db/schema";
import { applySync, type SyncRecord } from "@/lib/sync/apply-sync";
import { DATA_DIR, slugify } from "./lib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const OUT_DIR = path.join(DATA_DIR, "urdb-rates");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const RUNNER_ACTOR = "sync:urdb-rates";
const URDB_API_URL = "https://api.openei.org/utility_rates";
const PAGE_LIMIT = 500;
const SECTORS = ["Residential", "Commercial"] as const;

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Raw URDB rate record as returned by the OpenEI API. */
export interface UrdbRate {
  [key: string]: unknown;
  label: string;
  approved: boolean;
  eiaid: number | string;
  name: string;
  utility: string;
  sector: string;
  startdate?: number | null;
  enddate?: number | null;
  is_default?: boolean | null;
  description?: string | null;
  fixedchargefirstmeter?: number | null;
  fixedchargeunits?: string | null;
  energyratestructure?: unknown;
  energyweekdayschedule?: unknown;
  energyweekendschedule?: unknown;
  demandratestructure?: unknown;
  flatdemandstructure?: unknown;
  demandrateunit?: string | null;
  dgrules?: unknown;
  source?: string | null;
  sourceparent?: string | null;
  [key: string]: unknown;
}

export interface UrdbApiResponse {
  items?: UrdbRate[];
}

export interface SyncReport {
  sectors: string[];
  fetchedRates: number;
  keptRates: number;
  skippedUnapproved: number;
  skippedExpired: number;
  skippedLicense: number;
  skippedUnknownUtility: number;
  created: number;
  updated: number;
  unchanged: number;
  fieldsWritten: number;
  sourceUrlOk: number;
  sourceUrlDead: number;
  deferralsCount: number;
  errors: string[];
}

interface Manifest {
  source: string;
  generated_by: string;
  generated_at: string;
  sectors: string[];
  fetched_rates: number;
  kept_rates: number;
  skipped: {
    unapproved: number;
    expired: number;
    license: number;
    unknown_utility: number;
  };
  registry_counts: {
    created: number;
    updated: number;
    unchanged: number;
    fields_written: number;
  };
  source_url_status: {
    checked: number;
    ok: number;
    dead: number;
  };
  deferrals_count: number;
  errors: string[];
  notes: string[];
}

export interface EntityResolver {
  /** Map normalized eia_id string -> utility id */
  utilityIdByEiaId: Map<string, string>;
  /** Map normalized eia_id string -> region id (best-effort territory match) */
  regionIdByEiaId: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no network, no filesystem, no database)
// ---------------------------------------------------------------------------

export function normalizeEiaId(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "") return null;
  return str;
}

/** Convert a URDB unix-seconds timestamp to a JS Date (null when missing/invalid). */
export function urdbTimestampToDate(value: unknown): Date | null {
  if (value == null || value === "" || Number.isNaN(value)) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const date = new Date(num * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isApproved(rate: UrdbRate): boolean {
  return rate.approved === true;
}

/** A rate is "current" when it has no end date or its end date is in the future. */
export function isCurrent(rate: UrdbRate, nowSec: number): boolean {
  if (rate.enddate == null || rate.enddate === "") return true;
  return Number(rate.enddate) > nowSec;
}

/**
 * URDB is CC0 "unless otherwise noted". Flag any record whose source-side note
 * explicitly claims a non-CC0 restriction. This is intentionally conservative
 * and best-effort — URDB does not expose a structured license field.
 * TODO: When URDB adds a per-record license field, switch to that.
 */
export function hasRestrictiveLicense(rate: UrdbRate): boolean {
  const haystack = `${String(rate.source ?? "")} ${String(rate.sourceparent ?? "")}`.toLowerCase();
  const restrictiveNotes = [
    "all rights reserved",
    "copyright",
    "proprietary",
    "restricted",
    "not for redistribution",
    "do not redistribute",
    "licensed under",
    "non-commercial",
    "cc by",
    "cc-by",
    "cc nc",
    "cc-nc",
    "publication prohibited",
  ];
  return restrictiveNotes.some((note) => haystack.includes(note));
}

function distinctPeriodCount(schedule: unknown): number {
  if (!Array.isArray(schedule)) return 0;
  const seen = new Set<number>();
  for (const row of schedule) {
    if (!Array.isArray(row)) continue;
    for (const period of row) {
      if (typeof period === "number") seen.add(period);
    }
  }
  return seen.size;
}

export function deriveHasTou(rate: UrdbRate): boolean {
  const weekday = distinctPeriodCount(rate.energyweekdayschedule);
  const weekend = distinctPeriodCount(rate.energyweekendschedule);
  return Math.max(weekday, weekend) > 1;
}

function hasPositiveRate(structure: unknown): boolean {
  if (!Array.isArray(structure)) return false;
  for (const tier of structure) {
    if (!Array.isArray(tier)) {
      if (typeof tier === "object" && tier !== null && Number((tier as Record<string, unknown>).rate) > 0) {
        return true;
      }
      continue;
    }
    for (const entry of tier) {
      if (typeof entry === "object" && entry !== null && Number((entry as Record<string, unknown>).rate) > 0) {
        return true;
      }
    }
  }
  return false;
}

export function deriveHasDemandCharge(rate: UrdbRate): boolean {
  return hasPositiveRate(rate.demandratestructure) || hasPositiveRate(rate.flatdemandstructure);
}

export function deriveHasNetMetering(rate: UrdbRate): boolean {
  const rules = rate.dgrules;
  if (rules == null) return false;
  if (typeof rules !== "object") return false;
  const keys = Object.keys(rules as object).map((k) => k.toLowerCase());
  return keys.some((k) => k.includes("net") || k.includes("metering") || k.includes("dgrule"));
}

export const URDB_ATTRIBUTION = {
  source: "OpenEI Utility Rate Database (URDB)",
  publisher: "OpenEI / U.S. Department of Energy",
  sourceUrl: "https://openei.org/wiki/Utility_Rate_Database",
  apiDocumentationUrl: "https://apps.openei.org/services/doc/rest/util_rates/?version=8",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  licenseNotice: "Content is available under Creative Commons Zero unless otherwise noted.",
  changes:
    "CommonGrid projects API fields, derives explorer flags, and links unique EIA utility IDs. The complete API record is retained as JSONB.",
  disclaimer:
    "Published schedules, not verified household eligibility or prices. No endorsement implied. Linked utility documents retain their own terms.",
} as const;

const EV_HEURISTIC = /\b(EV|electric vehicle|PEV)\b/i;

/**
 * Recursively sort object keys so JSONB values compare stably after a
 * round-trip through Postgres (JSONB does not preserve insertion order).
 * Arrays are mapped; primitives are returned as-is.
 */
export function deepSortKeys(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function deriveIsEvRate(rate: UrdbRate): boolean {
  const text = `${rate.name ?? ""} ${rate.description ?? ""}`;
  return EV_HEURISTIC.test(text);
}

/**
 * Build a URL-safe, human-readable slug. Slugs must be stable across runs so
 * re-runs update rather than duplicate; the label suffix guarantees uniqueness.
 */
export function buildSlug(utilityName: string, rateName: string, label: string): string {
  const base = `${slugify(utilityName)}-${slugify(rateName)}`;
  return `${base}-${label}`.slice(0, 240);
}

export function mapUrdbRateToSyncRecord(rate: UrdbRate, resolver: EntityResolver): SyncRecord | null {
  const eiaIdStr = normalizeEiaId(rate.eiaid);
  if (!eiaIdStr) return null;

  const utilityId = resolver.utilityIdByEiaId.get(eiaIdStr) ?? null;
  const regionId = resolver.regionIdByEiaId.get(eiaIdStr) ?? null;

  const entityId = `rate-${rate.label}`;
  const slug = buildSlug(rate.utility ?? "unknown", rate.name, rate.label);
  // Effective dates are not upstream observation or verification dates.
  const asOf = null;

  return {
    sourceId: "urdb",
    asOf,
    entityId,
    slug,
    fields: pruneUndefined({
      rawRecord: deepSortKeys(rate),
      upstreamRecordUrl: `https://apps.openei.org/USURDB/rate/view/${encodeURIComponent(rate.label)}`,
      attribution: URDB_ATTRIBUTION,
      name: rate.name,
      eiaId: Number(rate.eiaid),
      utilityId,
      regionId,
      utilityName: rate.utility,
      sector: rate.sector,
      serviceType: null,
      description: rate.description,
      // `fixed_charge` is a Postgres `numeric` column, which Drizzle reads
      // back as a JS string. applySync compares desired-vs-current structurally, so a number here ("10" !== 10) would look changed on
      // every re-run and rewrite the row + a version each week. Store it as a
      // string so the diff is stable and re-runs stay idempotent.
      fixedCharge: rate.fixedchargefirstmeter == null ? rate.fixedchargefirstmeter : String(rate.fixedchargefirstmeter),
      fixedChargeUnits: rate.fixedchargeunits,
      energyRateStructure: deepSortKeys(rate.energyratestructure),
      energyWeekdaySchedule: deepSortKeys(rate.energyweekdayschedule),
      energyWeekendSchedule: deepSortKeys(rate.energyweekendschedule),
      demandRateStructure: deepSortKeys(rate.demandratestructure),
      flatDemandStructure: deepSortKeys(rate.flatdemandstructure),
      demandRateUnit: rate.demandrateunit,
      netMeteringRules: deepSortKeys(rate.dgrules),
      hasTou: deriveHasTou(rate),
      hasDemandCharge: deriveHasDemandCharge(rate),
      hasNetMetering: deriveHasNetMetering(rate),
      isEvRate: deriveIsEvRate(rate),
      startDate: urdbTimestampToDate(rate.startdate),
      endDate: urdbTimestampToDate(rate.enddate),
      approved: rate.approved === true,
      isDefault: rate.is_default === true,
      source: rate.source,
      sourceUrl: rate.source,
      sourceParentUrl: rate.sourceparent,
      sourceDate: null,
      sourceUrlStatus: null,
      sourceUrlCheckedAt: null,
    }),
  };
}

export function pruneUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface FilterResult {
  kept: UrdbRate[];
  unapproved: number;
  expired: number;
  license: number;
}

/**
 * Apply V1 filters: approved + current + CC0 + known utility.
 * Returns the kept records plus skip counters for the manifest.
 */
export function filterRates(
  rates: UrdbRate[],
  resolver: EntityResolver,
  nowSec: number
): { result: SyncRecord[]; unapproved: number; expired: number; license: number; unknownUtility: number } {
  const records: SyncRecord[] = [];
  let unapproved = 0;
  let expired = 0;
  let license = 0;
  let unknownUtility = 0;

  for (const rate of rates) {
    if (!isApproved(rate)) {
      unapproved++;
      continue;
    }
    if (!isCurrent(rate, nowSec)) {
      expired++;
      continue;
    }
    if (hasRestrictiveLicense(rate)) {
      license++;
      continue;
    }
    const eiaIdStr = normalizeEiaId(rate.eiaid);
    if (!eiaIdStr || !resolver.utilityIdByEiaId.has(eiaIdStr)) {
      unknownUtility++;
      continue;
    }
    const record = mapUrdbRateToSyncRecord(rate, resolver);
    if (record) records.push(record);
  }

  return { result: records, unapproved, expired, license, unknownUtility };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.NREL_API_KEY;
  if (!key) {
    console.warn("⚠️  NREL_API_KEY is not set — falling back to DEMO_KEY (heavily rate-limited).");
    return "DEMO_KEY";
  }
  return key;
}

export async function fetchUrdbRatesForSector(
  sector: string,
  apiKey: string,
  fetchImpl: Fetcher,
  opts: { limit?: number } = {}
): Promise<{ rates: UrdbRate[]; total?: number }> {
  const limit = opts.limit ?? PAGE_LIMIT;
  const rates: UrdbRate[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      version: "latest",
      format: "json",
      detail: "full",
      sector,
      limit: String(limit),
      offset: String(offset),
      api_key: apiKey,
    });

    const url = `${URDB_API_URL}?${params}`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`URDB fetch failed for sector ${sector}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as UrdbApiResponse;
    const items = data.items ?? [];
    rates.push(...items);

    if (items.length < limit) break;
    offset += limit;
  }

  return { rates };
}

// ---------------------------------------------------------------------------
// Source URL health checks
// ---------------------------------------------------------------------------

export type SourceUrlStatus = "ok" | "dead";

export interface SourceUrlCheckResult {
  status: SourceUrlStatus;
  checkedAt: Date;
}

const SOURCE_URL_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("timed out"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function checkSourceUrl(
  url: string,
  fetchImpl: Fetcher,
  timeoutMs = SOURCE_URL_TIMEOUT_MS
): Promise<SourceUrlCheckResult> {
  const checkedAt = new Date();

  const fetchWithTimeout = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    return withTimeout(fetchImpl(url, { method, signal: controller.signal, redirect: "follow" }), timeoutMs, () =>
      controller.abort()
    );
  };

  try {
    const head = await fetchWithTimeout("HEAD");
    if (head.ok || (head.status >= 300 && head.status < 400)) {
      return { status: "ok", checkedAt };
    }
    // Some hosts do not support HEAD; fall back to GET before marking dead.
    if (head.status === 405 || head.status === 501) {
      const get = await fetchWithTimeout("GET");
      if (get.ok || (get.status >= 300 && get.status < 400)) {
        return { status: "ok", checkedAt };
      }
    }
    return { status: "dead", checkedAt };
  } catch {
    return { status: "dead", checkedAt };
  }
}

/**
 * Check the health of each distinct sourceUrl, bounded by `concurrency`.
 * Duplicate URLs are checked once and the same result is reused.
 */
export async function checkSourceUrls(
  urls: string[],
  fetchImpl: Fetcher,
  opts: { concurrency?: number; timeoutMs?: number } = {}
): Promise<Map<string, SourceUrlCheckResult>> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const timeoutMs = opts.timeoutMs ?? SOURCE_URL_TIMEOUT_MS;
  const uniqueUrls = [...new Set(urls)].filter((url) => typeof url === "string" && url.length > 0);
  const results = new Map<string, SourceUrlCheckResult>();

  for (let i = 0; i < uniqueUrls.length; i += concurrency) {
    const batch = uniqueUrls.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (url) => {
        results.set(url, await checkSourceUrl(url, fetchImpl, timeoutMs));
      })
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Database resolver
// ---------------------------------------------------------------------------

/** Duplicate EIA IDs never resolve to an arbitrary last database row. */
export function buildEntityResolver(
  utilityRows: Array<{ id: string; eiaId: string | number | null }>,
  regionRows: Array<{ id: string; eiaId: string | number | null }>
): EntityResolver {
  const uniqueIndex = (rows: Array<{ id: string; eiaId: string | number | null }>) => {
    const matches = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = normalizeEiaId(row.eiaId);
      if (!key) continue;
      const ids = matches.get(key) ?? new Set<string>();
      ids.add(row.id);
      matches.set(key, ids);
    }
    const result = new Map<string, string>();
    for (const [key, ids] of matches) {
      const [id] = ids;
      if (ids.size === 1 && id !== undefined) result.set(key, id);
    }
    return result;
  };
  return { utilityIdByEiaId: uniqueIndex(utilityRows), regionIdByEiaId: uniqueIndex(regionRows) };
}

async function loadResolver(): Promise<EntityResolver> {
  const utilityIdByEiaId = new Map<string, string>();
  const regionIdByEiaId = new Map<string, string>();

  if (!process.env.DATABASE_URL) {
    return { utilityIdByEiaId, regionIdByEiaId };
  }

  const db = getPooledDb();

  const utilityRows = await db
    .select({ id: utilities.id, eiaId: utilities.eiaId })
    .from(utilities)
    .where(isNotNull(utilities.eiaId));

  const regionRows = await db
    .select({ id: regions.id, eiaId: regions.eiaId })
    .from(regions)
    .where(isNotNull(regions.eiaId));
  return buildEntityResolver(utilityRows, regionRows);
}

// ---------------------------------------------------------------------------
// Database publication
// ---------------------------------------------------------------------------

async function publishToDatabase(records: SyncRecord[]): Promise<
  Omit<
    SyncReport,
    keyof {
      sectors: unknown;
      fetchedRates: unknown;
      skippedUnapproved: unknown;
      skippedExpired: unknown;
      skippedLicense: unknown;
      skippedUnknownUtility: unknown;
      errors: unknown;
    }
  >
> {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "\n⚠️  DATABASE_URL is not set — skipping database publication. " +
        "The manifest is still written; rate_structures is NOT updated."
    );
    return { created: 0, updated: 0, unchanged: 0, fieldsWritten: 0, deferralsCount: 0 };
  }

  console.log("\nPublishing URDB rate structures to Postgres...");
  const date = new Date().toISOString().split("T")[0];
  const report = await applySync(records, {
    entityType: "rate_structure",
    initiatedBy: RUNNER_ACTOR,
    batchTitle: `URDB rates sync — ${date}`,
    batchDescription: `Approved, current residential + commercial rate structures from OpenEI URDB for utilities in the CommonGrid registry — ${records.length} records`,
  });

  console.log("  Publication complete:");
  console.log(`    Batch id: ${report.batchId}`);
  console.log(`    Created: ${report.created.toLocaleString()}`);
  console.log(`    Updated: ${report.updated.toLocaleString()}`);
  console.log(`    Unchanged: ${report.unchanged.toLocaleString()}`);
  console.log(`    Fields written: ${report.fieldsWritten.toLocaleString()}`);

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
    deferralsCount: report.deferrals.length,
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function writeManifest(report: SyncReport): void {
  const manifest: Manifest = {
    source: "OpenEI Utility Rate Database (URDB)",
    generated_by: RUNNER_ACTOR,
    generated_at: new Date().toISOString(),
    sectors: report.sectors,
    attribution: URDB_ATTRIBUTION,
    fetched_rates: report.fetchedRates,
    kept_rates: report.keptRates,
    skipped: {
      unapproved: report.skippedUnapproved,
      expired: report.skippedExpired,
      license: report.skippedLicense,
      unknown_utility: report.skippedUnknownUtility,
    },
    registry_counts: {
      created: report.created,
      updated: report.updated,
      unchanged: report.unchanged,
      fields_written: report.fieldsWritten,
    },
    source_url_status: {
      checked: report.sourceUrlOk + report.sourceUrlDead,
      ok: report.sourceUrlOk,
      dead: report.sourceUrlDead,
    },
    deferrals_count: report.deferralsCount,
    errors: report.errors,
    notes: [
      'Rate structures are published via applySync (entityType "rate_structure") to the Postgres registry.',
      "V1 scope: approved, currently-effective Residential + Commercial rates for utilities already in the CommonGrid registry.",
      "URDB API documentation carries a CC0-unless-otherwise-noted notice; heuristic restriction checks are not a license audit. Full records, source links and attribution are retained.",
      "Utility matches must be unique; unknown/ambiguous utilities are skipped and ambiguous regions remain unlinked. Effective dates are not verification dates.",
      "Re-runs are idempotent (stable rate-<label> ids) and conflict-aware (applySync policy B leaves human-edited fields untouched).",
    ],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface RunOptions {
  fetchImpl?: Fetcher;
  sectors?: string[];
  apiKey?: string;
  dryRun?: boolean;
  writeManifest?: boolean;
  /** When true, verify rate sourceUrl link health before publishing. */
  checkSourceUrls?: boolean;
}

export async function syncUrdbRates(options: RunOptions = {}): Promise<SyncReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sectorsToSync = options.sectors ?? [...SECTORS];
  const apiKey = options.apiKey ?? getApiKey();
  const dryRun = options.dryRun ?? false;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report: SyncReport = {
    sectors: sectorsToSync,
    fetchedRates: 0,
    keptRates: 0,
    skippedUnapproved: 0,
    skippedExpired: 0,
    skippedLicense: 0,
    skippedUnknownUtility: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    fieldsWritten: 0,
    sourceUrlOk: 0,
    sourceUrlDead: 0,
    deferralsCount: 0,
    errors: [],
  };

  const resolver = await loadResolver();
  console.log(`  Known utilities (eia_id): ${resolver.utilityIdByEiaId.size.toLocaleString()}`);

  const allRates: UrdbRate[] = [];

  for (const sector of sectorsToSync) {
    console.log(`  Fetching ${sector} rates from URDB...`);
    try {
      const { rates } = await fetchUrdbRatesForSector(sector, apiKey, fetchImpl);
      console.log(`    ${rates.length.toLocaleString()} rates fetched`);
      allRates.push(...rates);
    } catch (err) {
      const message = `Failed to fetch ${sector} rates: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`    ⚠️ ${message}`);
      report.errors.push(message);
    }
  }

  report.fetchedRates = allRates.length;
  const nowSec = Math.floor(Date.now() / 1000);
  const { result, unapproved, expired, license, unknownUtility } = filterRates(allRates, resolver, nowSec);

  report.keptRates = result.length;
  report.skippedUnapproved = unapproved;
  report.skippedExpired = expired;
  report.skippedLicense = license;
  report.skippedUnknownUtility = unknownUtility;

  // Optional source-url health check. Disabled by default so unit tests and
  // local runs do not hammer live document hosts; the weekly GitHub Actions
  // sync enables it via URDB_CHECK_SOURCE_URLS.
  const shouldCheckSourceUrls = options.checkSourceUrls ?? process.env.URDB_CHECK_SOURCE_URLS === "true";
  if (shouldCheckSourceUrls) {
    const sourceUrls = result.map((r) => r.fields.sourceUrl as string | undefined | null);
    const checkResults = await checkSourceUrls(sourceUrls, fetchImpl);

    for (const record of result) {
      const url = record.fields.sourceUrl;
      if (typeof url !== "string" || !url) continue;
      const check = checkResults.get(url);
      if (!check) continue;
      record.fields.sourceUrlStatus = check.status;
      record.fields.sourceUrlCheckedAt = check.checkedAt;
      if (check.status === "ok") {
        report.sourceUrlOk++;
      } else {
        report.sourceUrlDead++;
      }
    }

    console.log("\n  Source URL health check:");
    console.log(`    Checked: ${(report.sourceUrlOk + report.sourceUrlDead).toLocaleString()}`);
    console.log(`    OK: ${report.sourceUrlOk.toLocaleString()}`);
    console.log(`    Dead: ${report.sourceUrlDead.toLocaleString()}`);
  }

  console.log("\n  Mapping result:");
  console.log(`    Kept (will be published): ${result.length.toLocaleString()}`);
  console.log(`    Skipped unapproved: ${unapproved.toLocaleString()}`);
  console.log(`    Skipped expired: ${expired.toLocaleString()}`);
  console.log(`    Skipped license: ${license.toLocaleString()}`);
  console.log(`    Skipped unknown utility: ${unknownUtility.toLocaleString()}`);

  if (dryRun) {
    console.log("\n  --dry-run: not publishing to the database.");
  } else {
    const publishReport = await publishToDatabase(result);
    report.created = publishReport.created;
    report.updated = publishReport.updated;
    report.unchanged = publishReport.unchanged;
    report.fieldsWritten = publishReport.fieldsWritten;
    report.deferralsCount = publishReport.deferralsCount;
  }

  if (options.writeManifest !== false) {
    writeManifest(report);
  }

  return report;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function isDirectInvocation(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("sync-urdb-rates.ts") || entry.endsWith("sync-urdb-rates.js");
}

async function main() {
  console.log("Syncing URDB rate structures\n");
  const dryRun = process.argv.includes("--dry-run");

  const report = await syncUrdbRates({
    dryRun,
    checkSourceUrls: process.env.URDB_CHECK_SOURCE_URLS === "true",
  });

  console.log("\nSync complete:");
  console.log(`  Sectors: ${report.sectors.join(", ")}`);
  console.log(`  Fetched rates: ${report.fetchedRates.toLocaleString()}`);
  console.log(`  Kept rates: ${report.keptRates.toLocaleString()}`);
  console.log(`  Skipped unapproved: ${report.skippedUnapproved.toLocaleString()}`);
  console.log(`  Skipped expired: ${report.skippedExpired.toLocaleString()}`);
  console.log(`  Skipped license: ${report.skippedLicense.toLocaleString()}`);
  console.log(`  Skipped unknown utility: ${report.skippedUnknownUtility.toLocaleString()}`);
  console.log(`  Created: ${report.created.toLocaleString()}`);
  console.log(`  Updated: ${report.updated.toLocaleString()}`);
  console.log(`  Unchanged: ${report.unchanged.toLocaleString()}`);
  console.log(`  Fields written: ${report.fieldsWritten.toLocaleString()}`);
  console.log(`  Deferrals: ${report.deferralsCount.toLocaleString()}`);
  if (report.sourceUrlOk + report.sourceUrlDead > 0) {
    console.log(
      `  Source URLs checked: ${(report.sourceUrlOk + report.sourceUrlDead).toLocaleString()} (ok=${report.sourceUrlOk}, dead=${report.sourceUrlDead})`
    );
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
    console.error("URDB rate sync failed:", err);
    process.exit(1);
  });
}
