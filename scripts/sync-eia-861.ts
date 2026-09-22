/**
 * Sync script: Download and apply EIA-861 annual Demand Response statistics.
 *
 * ⚠️ DATA REALITY: EIA-861 "Demand Response" is UTILITY-LEVEL AGGREGATE
 * statistics, not a named-program catalog (see lib/sync/eia-861-dr.ts). This
 * script asserts per-utility DR totals + a `hasDemandResponse` existence signal
 * onto EXISTING utilities only. It never fabricates program entities and never
 * writes a null parent — unresolved rows are collected and reported.
 *
 * Mechanics (mirrors scripts/sync-power-plants-monthly.ts):
 *   fetch latest f861<YYYY>.zip → checksum/manifest change-detection →
 *   unzip + parse the Demand_Response_<YYYY>.xlsx (multi-row header) →
 *   resolve utilities via lib/sync/resolve-entity → applySync(entityType:utility)
 *   → write manifest + last-sync marker → log the report.
 *
 * Usage:
 *   npx tsx scripts/sync-eia-861.ts [--dry-run]
 *
 * Output:
 *   data/eia-861/f861<YYYY>.zip
 *   data/eia-861/Demand_Response_<YYYY>.xlsx
 *   data/eia-861/manifest.json
 *   data/.eia861-last-sync
 *
 * DATABASE_URL-gated: without it, parsing + resolution still run and report, but
 * the registry/changelog are not updated (a warning is logged).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { getPooledDb } from "@/lib/db/client-pooled";
import { utilities } from "@/lib/db/schema";
import { applySync } from "@/lib/sync/apply-sync";
import { type DemandResponseRow, EIA_861_ENTITY_TYPE, toSyncRecords } from "@/lib/sync/eia-861-dr";
import { buildUtilityLookups, type ResolverUtility } from "@/lib/sync/resolve-entity";

const EIA_861_PAGE = "https://www.eia.gov/electricity/data/eia861/";
const EIA_861_ZIP_DIR = "https://www.eia.gov/electricity/data/eia861/zip";
const EIA_861_ARCHIVE_ZIP_DIR = "https://www.eia.gov/electricity/data/eia861/archive/zip";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const EIA_861_DIR = path.join(DATA_DIR, "eia-861");
const MANIFEST_PATH = path.join(EIA_861_DIR, "manifest.json");
const LAST_SYNC_MARKER_PATH = path.join(DATA_DIR, ".eia861-last-sync");
const UTILITIES_JSON_PATH = path.join(DATA_DIR, "utilities.json");

/** Costs in the DR sheet are in THOUSAND dollars; convert to USD. */
const THOUSAND = 1000;

interface LatestZip {
  fileName: string;
  fileUrl: string;
  year: number;
  /** True for the preliminary "er" (early release) file. */
  preliminary: boolean;
}

interface ManifestData {
  source: string;
  source_page: string;
  data_reality: string;
  latest_year: number;
  zip_file_name: string;
  zip_file_url: string;
  zip_checksum_sha256: string;
  dr_file_name: string;
  dr_row_count: number;
  utilities_matched: number;
  utilities_unresolved: number;
  resolution_methods: Record<string, number>;
  updated_at: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Upstream discovery
// ---------------------------------------------------------------------------

/**
 * From the EIA-861 landing page HTML, pick the newest FINAL full-year zip
 * (f861<YYYY>.zip), preferring a final file over a preliminary "er" file for the
 * same-or-newer year. Falls back to the highest "er" file if no final exists.
 */
export function selectLatestZip(html: string): LatestZip | null {
  const seen = new Map<string, { year: number; preliminary: boolean; archive: boolean }>();
  const regex = /(?:archive\/)?zip\/(f861(\d{4})(er)?\.zip)/gi;
  for (const m of html.matchAll(regex)) {
    const fileName = m[1].toLowerCase();
    const year = Number(m[2]);
    const preliminary = Boolean(m[3]);
    const archive = m[0].toLowerCase().startsWith("archive/");
    if (!seen.has(fileName)) seen.set(fileName, { year, preliminary, archive });
  }
  if (seen.size === 0) return null;

  const entries = [...seen.entries()].map(([fileName, meta]) => ({ fileName, ...meta }));
  // Prefer: final over preliminary, then newest year.
  entries.sort((a, b) => {
    if (a.preliminary !== b.preliminary) return a.preliminary ? 1 : -1;
    return b.year - a.year;
  });
  const best = entries[0];
  const dir = best.archive ? EIA_861_ARCHIVE_ZIP_DIR : EIA_861_ZIP_DIR;
  return {
    fileName: best.fileName,
    fileUrl: `${dir}/${best.fileName}`,
    year: best.year,
    preliminary: best.preliminary,
  };
}

async function checkLatestZip(): Promise<LatestZip | null> {
  console.log("  Checking EIA-861 page for latest annual zip...");
  try {
    const response = await fetch(EIA_861_PAGE);
    if (!response.ok) {
      console.warn(`  Warning: EIA-861 page returned ${response.status}`);
      return null;
    }
    const html = await response.text();
    const latest = selectLatestZip(html);
    if (!latest) {
      console.log("  No annual zip files found on EIA-861 page");
      return null;
    }
    console.log(
      `  Latest available: ${latest.fileName} (year ${latest.year}${latest.preliminary ? ", preliminary" : ", final"})`
    );
    return latest;
  } catch (err) {
    console.warn(`  Warning: Could not check EIA-861 page: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Download + cache
// ---------------------------------------------------------------------------

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readManifest(): ManifestData | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as ManifestData;
  } catch {
    return null;
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 2).toString("utf-8") !== "PK") {
    const preview = buffer.subarray(0, 80).toString("utf-8").replace(/\s+/g, " ").trim();
    throw new Error(`Downloaded file is not a valid ZIP archive: ${preview}`);
  }
  fs.writeFileSync(destPath, buffer);
  console.log(`  Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

async function ensureZip(latest: LatestZip, manifest: ManifestData | null): Promise<string> {
  fs.mkdirSync(EIA_861_DIR, { recursive: true });
  const localPath = path.join(EIA_861_DIR, latest.fileName);
  const expectedSha = manifest?.zip_file_name === latest.fileName ? manifest.zip_checksum_sha256 : null;

  if (fs.existsSync(localPath)) {
    const actualSha = sha256File(localPath);
    if (!expectedSha || actualSha === expectedSha) {
      console.log(`  Using cached ${latest.fileName} (${(fs.statSync(localPath).size / 1024 / 1024).toFixed(1)} MB)`);
      return localPath;
    }
    console.warn(`  Cached ${latest.fileName} checksum mismatch; re-downloading`);
    fs.unlinkSync(localPath);
  }

  await downloadFile(latest.fileUrl, localPath);
  return localPath;
}

// ---------------------------------------------------------------------------
// Parsing — the Demand Response sheet has a 3-row header (see CG-289 notes)
// ---------------------------------------------------------------------------

/**
 * Extract the Demand_Response_<YYYY>.xlsx from the annual zip to the data dir
 * and return its path. The DR file name embeds the data year.
 */
function extractDemandResponseFile(zipPath: string): { filePath: string; fileName: string } {
  const zip = new AdmZip(zipPath);
  const entry = zip
    .getEntries()
    .find(
      (e) =>
        /demand_response/i.test(e.entryName) &&
        e.entryName.toLowerCase().endsWith(".xlsx") &&
        !e.entryName.startsWith("~")
    );
  if (!entry) throw new Error("Demand Response xlsx not found in EIA-861 zip");
  const fileName = path.basename(entry.entryName);
  const filePath = path.join(EIA_861_DIR, fileName);
  fs.writeFileSync(filePath, entry.getData());
  return { filePath, fileName };
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const text = String(val).trim();
  if (!text || text === ".") return 0;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s === ".") return null;
  return s;
}

/**
 * Column layout of the "Demand Response_States" sheet. The header spans three
 * rows; the third row carries per-column labels. Each metric group is split
 * Residential/Commercial/Industrial/Transportation/Total — we read the "Total"
 * column of each group (aggregation across classes is already done by EIA in
 * that Total, so we take Total directly and further sum across a utility's rows
 * in the mapping layer).
 *
 * Fixed offsets derived from the 2024 file (validated against the row-2 labels):
 *   0 Data Year | 1 Utility Number | 2 Utility Name | 3 State | 4 BA Code
 *   5-9   Customers Enrolled     (Total @ 9)
 *   10-14 Energy Savings (MWh)   (Total @ 14)
 *   15-19 Potential Peak (MW)    (Total @ 19)
 *   20-24 Actual Peak (MW)       (Total @ 24)
 *   25-29 Customer Incentives ($k)(Total @ 29)
 *   30-34 All Other Costs ($k)   (Total @ 34)
 */
const COL = {
  dataYear: 0,
  utilityNumber: 1,
  utilityName: 2,
  state: 3,
  baCode: 4,
  customersEnrolledTotal: 9,
  energySavingsTotal: 14,
  potentialPeakTotal: 19,
  actualPeakTotal: 24,
  customerIncentivesTotal: 29,
  allOtherCostsTotal: 34,
} as const;

/**
 * Locate the header row (the one whose cells include "Utility Number") and
 * return the index of the first data row after it.
 */
function findDataStart(rows: unknown[][]): number {
  const headerIdx = rows.findIndex((row) => row.some((c) => String(c ?? "").trim() === "Utility Number"));
  if (headerIdx < 0) throw new Error("Could not find 'Utility Number' header row in Demand Response sheet");
  return headerIdx + 1;
}

export function parseDemandResponseWorkbook(filePath: string): { rows: DemandResponseRow[]; sheet: string } {
  const workbook = XLSX.readFile(filePath);
  // The utility-level statistics live on the "States" sheet.
  const sheetName = workbook.SheetNames.find((n) => /state/i.test(n)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Demand Response sheet not found: ${sheetName}`);

  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const dataStart = findDataStart(raw);

  const rows: DemandResponseRow[] = [];
  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length === 0) continue;
    const utilityNumber = parseStr(r[COL.utilityNumber]);
    // Skip non-data / total / blank rows: require a numeric utility number.
    if (!utilityNumber || Number.isNaN(Number(utilityNumber.replace(/,/g, "")))) continue;

    const reportYear = Math.trunc(parseNum(r[COL.dataYear])) || new Date().getFullYear();
    rows.push({
      utilityNumber,
      utilityName: parseStr(r[COL.utilityName]) ?? `Utility ${utilityNumber}`,
      state: parseStr(r[COL.state]),
      baCode: parseStr(r[COL.baCode]),
      reportYear,
      customersEnrolled: parseNum(r[COL.customersEnrolledTotal]),
      energySavingsMwh: parseNum(r[COL.energySavingsTotal]),
      potentialPeakSavingsMw: parseNum(r[COL.potentialPeakTotal]),
      actualPeakSavingsMw: parseNum(r[COL.actualPeakTotal]),
      programCostUsd: (parseNum(r[COL.customerIncentivesTotal]) + parseNum(r[COL.allOtherCostsTotal])) * THOUSAND,
    });
  }

  return { rows, sheet: sheetName };
}

// ---------------------------------------------------------------------------
// Resolver lookups
// ---------------------------------------------------------------------------

function loadUtilityLookups(): ReturnType<typeof buildUtilityLookups> {
  const raw = JSON.parse(fs.readFileSync(UTILITIES_JSON_PATH, "utf-8")) as Array<
    ResolverUtility & { jurisdiction?: string | null }
  >;
  // data/utilities.json carries a utility's state(s) under `jurisdiction`
  // (a comma-separated 2-letter list), NOT `state`. Map it across so the
  // resolver's `ba_state` rung is actually populated; without this the
  // (baCode, state) index would be empty and rung 2 could never match.
  // Multi-state utilities are expanded into one entry per state so each
  // (baCode, state) pair is indexed independently.
  const utils: ResolverUtility[] = raw.flatMap((u) => {
    if (u.state) return [u];
    const states = (u.jurisdiction ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (states.length === 0) return [u];
    return states.map((state) => ({ ...u, state }));
  });
  return buildUtilityLookups(utils);
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

interface PublishResult {
  matched: number;
  unresolved: number;
  methods: Record<string, number>;
  created: number;
  updated: number;
  unchanged: number;
  deferrals: number;
}

async function publish(rows: DemandResponseRow[], sourceFile: string, dryRun: boolean): Promise<PublishResult> {
  const lookups = loadUtilityLookups();

  if (dryRun || !process.env.DATABASE_URL) {
    if (dryRun) console.log("\n[dry-run] Resolving without DB publication...");
    else
      console.warn(
        "\n⚠️  DATABASE_URL is not set — skipping database publication. " +
          "Parsing and resolution still run; the registry and changelog will NOT be updated."
      );
    // Resolve against the local snapshot's ids so the report is still meaningful.
    const snapshotIds = new Set(lookups.byEiaId.values());
    for (const set of lookups.byBaState.values()) for (const id of set) snapshotIds.add(id);
    const { records, unresolved, methodCounts } = toSyncRecords(rows, snapshotIds, lookups);
    return {
      matched: records.length,
      unresolved: unresolved.length,
      methods: methodCounts,
      created: 0,
      updated: 0,
      unchanged: 0,
      deferrals: 0,
    };
  }

  console.log("\nPublishing utility-level DR metrics to the registry (Postgres)...");
  const db = getPooledDb();
  const existingRows = await db.select({ id: utilities.id }).from(utilities);
  const existingIds = new Set(existingRows.map((row) => row.id));

  const { records, unresolved, methodCounts } = toSyncRecords(rows, existingIds, lookups);
  const report = await applySync(records, {
    entityType: EIA_861_ENTITY_TYPE,
    initiatedBy: "sync:eia-861",
    batchTitle: "EIA-861 annual sync",
    batchDescription: `EIA-861 demand response from ${sourceFile}`,
  });

  console.log("  Registry publication complete:");
  console.log(`    Batch id: ${report.batchId}`);
  console.log(`    Matched utilities: ${records.length.toLocaleString()}`);
  console.log(`    Unresolved rows: ${unresolved.length.toLocaleString()}`);
  console.log(`    Created: ${report.created.toLocaleString()}`);
  console.log(`    Updated: ${report.updated.toLocaleString()}`);
  console.log(`    Unchanged: ${report.unchanged.toLocaleString()}`);
  console.log(`    Fields written: ${report.fieldsWritten.toLocaleString()}`);

  if (report.deferrals.length > 0) {
    console.log(
      `    ⚠️  Deferred ${report.deferrals.length.toLocaleString()} field(s) a human last edited (policy B — not overwritten)`
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

  logUnresolved(unresolved);

  return {
    matched: records.length,
    unresolved: unresolved.length,
    methods: methodCounts,
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    deferrals: report.deferrals.length,
  };
}

function logUnresolved(unresolved: ReadonlyArray<{ utilityNumber: string; utilityName: string }>): void {
  if (unresolved.length === 0) return;
  console.log(`\n  Unresolved DR rows (never written — reported only): ${unresolved.length.toLocaleString()}`);
  for (const u of unresolved.slice(0, 20)) {
    console.log(`    - EIA #${u.utilityNumber} "${u.utilityName}"`);
  }
  if (unresolved.length > 20) console.log(`    … and ${(unresolved.length - 20).toLocaleString()} more`);
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function writeManifest(
  latest: LatestZip,
  checksum: string,
  drFileName: string,
  result: PublishResult,
  rowCount: number
): void {
  const manifest: ManifestData = {
    source: "EIA Form 861 — Annual Electric Power Industry Report (Demand Response)",
    source_page: EIA_861_PAGE,
    data_reality:
      "Utility-level AGGREGATE demand-response statistics (enrolled customers, peak/energy savings, program costs). NOT a named-program catalog.",
    latest_year: latest.year,
    zip_file_name: latest.fileName,
    zip_file_url: latest.fileUrl,
    zip_checksum_sha256: checksum,
    dr_file_name: drFileName,
    dr_row_count: rowCount,
    utilities_matched: result.matched,
    utilities_unresolved: result.unresolved,
    resolution_methods: result.methods,
    updated_at: new Date().toISOString(),
    notes: [
      "EIA-861 final is annual; revisions trickle in, so the cron re-checks monthly.",
      "DR metrics are asserted onto EXISTING utilities only; unresolved rows are reported, never written with a null parent.",
      "Costs are reported in thousand-dollars in the source and stored here as USD.",
    ],
  };
  fs.mkdirSync(EIA_861_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Syncing EIA-861 annual Demand Response statistics${dryRun ? " (dry-run)" : ""}\n`);

  const manifest = readManifest();
  const latest = await checkLatestZip();
  if (!latest) {
    console.log("\nNo updates available. Exiting.");
    return;
  }

  const zipPath = await ensureZip(latest, manifest);
  const checksum = sha256File(zipPath);
  const markerPayload = `${latest.fileName}\n${checksum}`;

  if (!dryRun && fs.existsSync(LAST_SYNC_MARKER_PATH)) {
    const markerLines = fs.readFileSync(LAST_SYNC_MARKER_PATH, "utf-8").trim().split(/\r?\n/);
    if (markerLines[0] === latest.fileName && markerLines[1] === checksum) {
      console.log(`\nAlready synced ${latest.fileName}. No update needed.`);
      return;
    }
  }

  console.log("\nExtracting + parsing Demand Response workbook...");
  const { filePath, fileName } = extractDemandResponseFile(zipPath);
  const { rows, sheet } = parseDemandResponseWorkbook(filePath);
  console.log(`  Parsed ${rows.length.toLocaleString()} DR rows from sheet "${sheet}" (${fileName})`);

  const result = await publish(rows, fileName, dryRun);

  if (!dryRun) {
    writeManifest(latest, checksum, fileName, result, rows.length);
    fs.writeFileSync(LAST_SYNC_MARKER_PATH, `${markerPayload}\n${new Date().toISOString()}\n`);
  }

  console.log("\nEIA-861 sync complete:");
  console.log(`  Zip file: ${latest.fileName} (year ${latest.year})`);
  console.log(`  DR rows parsed: ${rows.length.toLocaleString()}`);
  console.log(`  Utilities matched: ${result.matched.toLocaleString()}`);
  console.log(`  Rows unresolved: ${result.unresolved.toLocaleString()}`);
  console.log(
    `  Resolution methods: eia_id=${result.methods.eia_id ?? 0}, ba_state=${result.methods.ba_state ?? 0}, name_trgm=${result.methods.name_trgm ?? 0}`
  );
  if (!dryRun && process.env.DATABASE_URL) {
    console.log(
      `  Created: ${result.created.toLocaleString()} · Updated: ${result.updated.toLocaleString()} · Unchanged: ${result.unchanged.toLocaleString()} · Deferrals: ${result.deferrals.toLocaleString()}`
    );
  }
}

const invokedDirectly = (() => {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("sync-eia-861.ts") || entry.endsWith("sync-eia-861.js");
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("EIA-861 sync failed:", err);
    process.exit(1);
  });
}

export { main };
