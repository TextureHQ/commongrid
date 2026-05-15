/**
 * Sync script: Download and apply EIA-860M monthly preliminary generator updates.
 *
 * EIA-860M is the monthly supplement to the annual Form EIA-860 generator inventory.
 * It publishes current operating, planned, retired, canceled/postponed, and Puerto Rico
 * generator sheets between annual EIA-860 releases.
 *
 * Usage:
 *   npx tsx scripts/sync-power-plants-monthly.ts
 *
 * Output:
 *   data/eia-860m/<month>_generator<year>.xlsx
 *   data/eia-860m/manifest.json
 *   data/.eia860m-last-sync
 *   data/power-plants.json
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { slugify } from "./lib";

const EIA_860M_PAGE = "https://www.eia.gov/electricity/data/eia860m/";
const EIA_860M_XLS_DIR = "https://www.eia.gov/electricity/data/eia860m/xls";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const EIA_860M_DIR = path.join(DATA_DIR, "eia-860m");
const MANIFEST_PATH = path.join(EIA_860M_DIR, "manifest.json");
const POWER_PLANTS_PATH = path.join(DATA_DIR, "power-plants.json");
const LAST_SYNC_MARKER_PATH = path.join(DATA_DIR, ".eia860m-last-sync");

export const EIA_860M_FILENAME_REGEX = /(?:archive\/)?(?:xls\/)?([a-z]+_generator\d{4}\.xlsx)/gi;

const REQUIRED_SHEETS = [
  "Operating",
  "Planned",
  "Retired",
  "Canceled or Postponed",
  "Operating_PR",
  "Planned_PR",
  "Retired_PR",
] as const;

type RequiredSheet = (typeof REQUIRED_SHEETS)[number];
type GeneratorKind = "operating" | "planned" | "retired" | "canceled_or_postponed";

const SHEET_KINDS: Record<RequiredSheet, GeneratorKind> = {
  Operating: "operating",
  Planned: "planned",
  Retired: "retired",
  "Canceled or Postponed": "canceled_or_postponed",
  Operating_PR: "operating",
  Planned_PR: "planned",
  Retired_PR: "retired",
};

const MONTH_TO_NUMBER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FUEL_CODE_TO_CATEGORY: Record<string, string> = {
  SUN: "Solar",
  WND: "Wind",
  NUC: "Nuclear",
  NG: "Natural Gas",
  BIT: "Coal",
  SUB: "Coal",
  LIG: "Coal",
  RC: "Coal",
  ANT: "Coal",
  COL: "Coal",
  DFO: "Petroleum",
  RFO: "Petroleum",
  JF: "Petroleum",
  KER: "Petroleum",
  PC: "Petroleum",
  PG: "Petroleum",
  WO: "Petroleum",
  WAT: "Hydro",
  MWH: "Battery Storage",
  WDS: "Biomass/Other",
  BLQ: "Biomass/Other",
  AB: "Biomass/Other",
  MSW: "Biomass/Other",
  OBS: "Biomass/Other",
  WDL: "Biomass/Other",
  SLW: "Biomass/Other",
  LFG: "Biomass/Other",
  OBG: "Biomass/Other",
  OBL: "Biomass/Other",
  GEO: "Biomass/Other",
  OTH: "Biomass/Other",
  PUR: "Biomass/Other",
  TDF: "Biomass/Other",
  SGC: "Biomass/Other",
  BFG: "Biomass/Other",
  SC: "Biomass/Other",
  SGP: "Biomass/Other",
  H2: "Biomass/Other",
};

interface LatestMonthlyFile {
  fileName: string;
  fileUrl: string;
  month: string;
  monthNumber: number;
  year: number;
  monthIso: string;
  monthLabel: string;
}

interface ManifestFileEntry {
  file_name: string;
  file_url: string;
  month: string;
  month_label: string;
  file_size_bytes: number;
  checksum_sha256: string;
  local_path: string;
  parsed_at: string;
  sheet_row_counts: Record<RequiredSheet, number>;
}

interface Eia860mManifest {
  source: string;
  source_page: string;
  latest_month: string;
  latest_month_label: string;
  file_name: string;
  file_url: string;
  file_date?: string;
  file_release_date_iso?: string;
  next_release_date?: string;
  file_size_bytes: number;
  checksum_sha256: string;
  local_path: string;
  sheets: RequiredSheet[];
  sheet_row_counts?: Record<RequiredSheet, number>;
  files?: ManifestFileEntry[];
  notes: string[];
  captured_at?: string;
  captured_by?: string;
  updated_at?: string;
}

interface GeneratorRow {
  kind: GeneratorKind;
  sourceSheet: RequiredSheet;
  entityId: string | null;
  entityName: string;
  plantCode: string;
  plantName: string;
  state: string;
  county: string | null;
  baCode: string | null;
  sector: string;
  generatorId: string;
  capacityMw: number;
  technology: string | null;
  energySource: string | null;
  operatingYear: number | null;
  plannedOperationYear: number | null;
  retirementYear: number | null;
  statusText: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface PlantAggregate {
  plantCode: string;
  name: string;
  utilityEiaId: string | null;
  utilityName: string;
  state: string;
  county: string | null;
  baCode: string | null;
  sector: string;
  latitude: number | null;
  longitude: number | null;
  operatingCapacityMw: number;
  operatingGeneratorCount: number;
  proposedCapacityMw: number;
  proposedGeneratorCount: number;
  technologies: Set<string>;
  energySources: Set<string>;
  oldestOperatingYear: number | null;
  earliestProposedOnlineYear: number | null;
  sourceSheets: Set<RequiredSheet>;
}

interface PowerPlantRecord {
  id: string;
  slug: string;
  name: string;
  plantCode: string;
  utilityId: string | null;
  utilityName: string;
  balancingAuthorityId: string | null;
  baCode: string | null;
  state: string;
  county: string | null;
  latitude: number;
  longitude: number;
  nercRegion: string | null;
  sector: string;
  primaryFuel: string | null;
  fuelCategory: string;
  technologies: string[];
  energySources: string[];
  totalCapacityMw: number;
  generatorCount: number;
  operatingYear: number | null;
  gridVoltageKv: number | null;
  status: "operable" | "proposed";
  proposedCapacityMw: number | null;
  proposedOnlineYear: number | null;
}

interface UtilityRecord {
  id: string;
  eiaId: string | number | null;
}

interface BalancingAuthorityRecord {
  id: string;
  eiaCode: string | null;
}

interface MergeStats {
  updatedPlants: number;
  insertedPlants: number;
  unchangedPlants: number;
  skippedMissingCoordinates: number;
  operatingGenerators: number;
  plannedGenerators: number;
  retiredGenerators: number;
  canceledOrPostponedGenerators: number;
  puertoRicoPlantsMerged: number;
  puertoRicoOperatingGenerators: number;
  puertoRicoPlannedGenerators: number;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const text = String(val).trim();
  if (!text || text === ".") return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s === ".") return null;
  return s;
}

function roundCapacity(value: number): number {
  return Math.round(value * 10) / 10;
}

function getFuelCategory(energySources: Iterable<string>): string {
  for (const source of energySources) {
    const category = FUEL_CODE_TO_CATEGORY[source];
    if (category) return category;
  }
  return "Biomass/Other";
}

function plantSlugify(name: string, state: string, plantCode: string): string {
  const base = slugify(name, { normalizeEmDashes: true, stripParentheticals: true });
  if (!base || base.length < 2) return `plant-${plantCode}`;
  return `${base}-${state.toLowerCase()}`;
}

function fileSortKey(fileName: string): number {
  const parsed = parseFileName(fileName);
  return parsed.year * 100 + parsed.monthNumber;
}

function parseFileName(fileName: string): Omit<LatestMonthlyFile, "fileUrl"> {
  const match = /^([a-z]+)_generator(\d{4})\.xlsx$/i.exec(fileName);
  if (!match) throw new Error(`Unexpected EIA-860M filename: ${fileName}`);

  const month = match[1].toLowerCase();
  const monthNumber = MONTH_TO_NUMBER[month];
  if (!monthNumber) throw new Error(`Unexpected EIA-860M month in filename: ${fileName}`);

  const year = Number(match[2]);
  return {
    fileName,
    month,
    monthNumber,
    year,
    monthIso: `${year}-${String(monthNumber).padStart(2, "0")}`,
    monthLabel: `${MONTH_LABELS[monthNumber - 1]} ${year}`,
  };
}

export function extractMonthlyFilenames(html: string): string[] {
  const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const seen = new Set<string>();
  const files: string[] = [];
  for (const match of htmlWithoutComments.matchAll(EIA_860M_FILENAME_REGEX)) {
    const fileName = match[1].toLowerCase();
    if (!seen.has(fileName)) {
      seen.add(fileName);
      files.push(fileName);
    }
  }
  return files.sort((a, b) => fileSortKey(a) - fileSortKey(b));
}

async function checkLatestMonth(): Promise<LatestMonthlyFile | null> {
  console.log("  Checking EIA-860M page for latest month...");
  try {
    const response = await fetch(EIA_860M_PAGE);
    if (!response.ok) {
      console.warn(`  Warning: EIA-860M page returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    const files = extractMonthlyFilenames(html);
    if (files.length === 0) {
      console.log("  No monthly files found on EIA-860M page");
      return null;
    }

    const fileName = files[files.length - 1];
    const parsed = parseFileName(fileName);
    const latest = { ...parsed, fileUrl: `${EIA_860M_XLS_DIR}/${fileName}` };
    console.log(`  Latest available: ${latest.fileName} (${latest.monthLabel})`);
    return latest;
  } catch (err) {
    console.warn(`  Warning: Could not check EIA-860M page: ${err}`);
    return null;
  }
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readManifest(): Eia860mManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Eia860mManifest;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 2).toString("utf-8") !== "PK") {
    const preview = buffer.subarray(0, 80).toString("utf-8").replace(/\s+/g, " ").trim();
    throw new Error(`Downloaded file is not a valid XLSX archive: ${preview}`);
  }
  fs.writeFileSync(destPath, buffer);
  console.log(`  Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

async function ensureMonthlyFile(latest: LatestMonthlyFile, manifest: Eia860mManifest | null): Promise<string> {
  fs.mkdirSync(EIA_860M_DIR, { recursive: true });
  const localPath = path.join(EIA_860M_DIR, latest.fileName);
  const manifestEntry = manifest?.files?.find((entry) => entry.file_name === latest.fileName);
  const expectedSha =
    manifestEntry?.checksum_sha256 ?? (manifest?.file_name === latest.fileName ? manifest.checksum_sha256 : null);

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

function headerIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((header) => header.toLowerCase().replace(/\s+/g, " ").trim());
  for (const candidate of candidates) {
    const target = candidate.toLowerCase();
    const exact = normalized.indexOf(target);
    if (exact >= 0) return exact;
    const partial = normalized.findIndex((header) => header.includes(target));
    if (partial >= 0) return partial;
  }
  return -1;
}

function requireColumn(headers: string[], sheetName: string, candidates: string[]): number {
  const idx = headerIndex(headers, candidates);
  if (idx < 0) throw new Error(`Missing column in ${sheetName}: ${candidates.join(" / ")}`);
  return idx;
}

function parseGeneratorSheet(workbook: XLSX.WorkBook, sheetName: RequiredSheet): GeneratorRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing required EIA-860M sheet: ${sheetName}`);

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerRowIdx = rawRows.findIndex((row) => row.some((cell) => String(cell ?? "").trim() === "Plant ID"));
  if (headerRowIdx < 0) throw new Error(`Could not find header row in ${sheetName}`);

  const headers = rawRows[headerRowIdx].map((cell) => String(cell ?? "").trim());
  const col = {
    entityId: requireColumn(headers, sheetName, ["Entity ID"]),
    entityName: requireColumn(headers, sheetName, ["Entity Name"]),
    plantCode: requireColumn(headers, sheetName, ["Plant ID"]),
    plantName: requireColumn(headers, sheetName, ["Plant Name"]),
    state: requireColumn(headers, sheetName, ["Plant State"]),
    county: requireColumn(headers, sheetName, ["County"]),
    baCode: requireColumn(headers, sheetName, ["Balancing Authority Code"]),
    sector: requireColumn(headers, sheetName, ["Sector"]),
    generatorId: requireColumn(headers, sheetName, ["Generator ID"]),
    capacity: requireColumn(headers, sheetName, ["Nameplate Capacity (MW)", "Nameplate Capacity"]),
    technology: requireColumn(headers, sheetName, ["Technology"]),
    energySource: requireColumn(headers, sheetName, ["Energy Source Code", "Energy Source"]),
    latitude: requireColumn(headers, sheetName, ["Latitude"]),
    longitude: requireColumn(headers, sheetName, ["Longitude"]),
    operatingYear: headerIndex(headers, ["Operating Year"]),
    plannedOperationYear: headerIndex(headers, ["Planned Operation Year"]),
    retirementYear: headerIndex(headers, ["Retirement Year", "Planned Retirement Year"]),
    status: headerIndex(headers, ["Status"]),
  };

  const kind = SHEET_KINDS[sheetName];
  const rows: GeneratorRow[] = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const plantCode = parseStr(row[col.plantCode]);
    const generatorId = parseStr(row[col.generatorId]);
    if (!plantCode || !generatorId) continue;

    const capacityMw = parseNum(row[col.capacity]);
    if (capacityMw === null || capacityMw <= 0) continue;

    rows.push({
      kind,
      sourceSheet: sheetName,
      entityId: parseStr(row[col.entityId]),
      entityName: parseStr(row[col.entityName]) ?? "",
      plantCode,
      plantName: parseStr(row[col.plantName]) ?? `Plant ${plantCode}`,
      state: parseStr(row[col.state]) ?? "",
      county: parseStr(row[col.county]),
      baCode: parseStr(row[col.baCode]),
      sector: parseStr(row[col.sector]) ?? "Unknown",
      generatorId,
      capacityMw,
      technology: parseStr(row[col.technology]),
      energySource: parseStr(row[col.energySource]),
      operatingYear: col.operatingYear >= 0 ? parseNum(row[col.operatingYear]) : null,
      plannedOperationYear: col.plannedOperationYear >= 0 ? parseNum(row[col.plannedOperationYear]) : null,
      retirementYear: col.retirementYear >= 0 ? parseNum(row[col.retirementYear]) : null,
      statusText: col.status >= 0 ? parseStr(row[col.status]) : null,
      latitude: parseNum(row[col.latitude]),
      longitude: parseNum(row[col.longitude]),
    });
  }

  return rows;
}

export type { GeneratorRow, PlantAggregate, RequiredSheet };

export function parseEia860mWorkbook(filePath: string): {
  rows: GeneratorRow[];
  sheetRowCounts: Record<RequiredSheet, number>;
} {
  const workbook = XLSX.readFile(filePath);
  for (const required of REQUIRED_SHEETS) {
    if (!workbook.Sheets[required]) throw new Error(`Missing required EIA-860M sheet: ${required}`);
  }

  const rows: GeneratorRow[] = [];
  const sheetRowCounts = Object.fromEntries(REQUIRED_SHEETS.map((sheet) => [sheet, 0])) as Record<
    RequiredSheet,
    number
  >;
  for (const sheetName of REQUIRED_SHEETS) {
    const sheetRows = parseGeneratorSheet(workbook, sheetName);
    sheetRowCounts[sheetName] = sheetRows.length;
    rows.push(...sheetRows);
    console.log(`  Parsed ${sheetRows.length.toLocaleString()} generator rows from ${sheetName}`);
  }

  return { rows, sheetRowCounts };
}

export function aggregateGenerators(rows: GeneratorRow[]): Map<string, PlantAggregate> {
  const aggregates = new Map<string, PlantAggregate>();

  for (const row of rows) {
    if (row.kind === "retired" || row.kind === "canceled_or_postponed") continue;

    let aggregate = aggregates.get(row.plantCode);
    if (!aggregate) {
      aggregate = {
        plantCode: row.plantCode,
        name: row.plantName,
        utilityEiaId: row.entityId,
        utilityName: row.entityName,
        state: row.state,
        county: row.county,
        baCode: row.baCode,
        sector: row.sector,
        latitude: row.latitude,
        longitude: row.longitude,
        operatingCapacityMw: 0,
        operatingGeneratorCount: 0,
        proposedCapacityMw: 0,
        proposedGeneratorCount: 0,
        technologies: new Set(),
        energySources: new Set(),
        oldestOperatingYear: null,
        earliestProposedOnlineYear: null,
        sourceSheets: new Set(),
      };
      aggregates.set(row.plantCode, aggregate);
    }
    aggregate.sourceSheets.add(row.sourceSheet);

    if (!aggregate.utilityEiaId && row.entityId) aggregate.utilityEiaId = row.entityId;
    if (row.entityName && (!aggregate.utilityName || aggregate.utilityName === "Unknown"))
      aggregate.utilityName = row.entityName;
    if (!aggregate.county && row.county) aggregate.county = row.county;
    if (!aggregate.baCode && row.baCode) aggregate.baCode = row.baCode;
    if (!aggregate.latitude && row.latitude) aggregate.latitude = row.latitude;
    if (!aggregate.longitude && row.longitude) aggregate.longitude = row.longitude;
    if (row.technology) aggregate.technologies.add(row.technology);
    if (row.energySource) aggregate.energySources.add(row.energySource);

    if (row.kind === "operating") {
      aggregate.operatingCapacityMw += row.capacityMw;
      aggregate.operatingGeneratorCount += 1;
      if (row.operatingYear !== null) {
        aggregate.oldestOperatingYear =
          aggregate.oldestOperatingYear === null
            ? row.operatingYear
            : Math.min(aggregate.oldestOperatingYear, row.operatingYear);
      }
    } else if (row.kind === "planned") {
      aggregate.proposedCapacityMw += row.capacityMw;
      aggregate.proposedGeneratorCount += 1;
      if (row.plannedOperationYear !== null) {
        aggregate.earliestProposedOnlineYear =
          aggregate.earliestProposedOnlineYear === null
            ? row.plannedOperationYear
            : Math.min(aggregate.earliestProposedOnlineYear, row.plannedOperationYear);
      }
    }
  }

  return aggregates;
}

function buildUtilityLookup(): Map<string, string> {
  const utilities = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "utilities.json"), "utf-8")) as UtilityRecord[];
  const byEiaId = new Map<string, string>();
  for (const utility of utilities) {
    if (utility.eiaId !== null && utility.eiaId !== undefined) byEiaId.set(String(utility.eiaId), utility.id);
  }
  return byEiaId;
}

function buildBalancingAuthorityLookup(): Map<string, string> {
  const bas = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "balancing-authorities.json"), "utf-8")
  ) as BalancingAuthorityRecord[];
  const byCode = new Map<string, string>();
  for (const ba of bas) {
    if (ba.eiaCode) byCode.set(ba.eiaCode, ba.id);
  }
  return byCode;
}

function createPowerPlantRecord(
  aggregate: PlantAggregate,
  utilityByEiaId: Map<string, string>,
  baByCode: Map<string, string>
): PowerPlantRecord | null {
  if (aggregate.latitude === null || aggregate.longitude === null) return null;

  const energySources = Array.from(aggregate.energySources);
  const technologies = Array.from(aggregate.technologies);
  const fuelCategory = getFuelCategory(energySources);
  const hasOperating = aggregate.operatingGeneratorCount > 0;
  const state = aggregate.state || "NA";

  return {
    id: `plant-${aggregate.plantCode}`,
    slug: plantSlugify(aggregate.name, state, aggregate.plantCode),
    name: aggregate.name,
    plantCode: aggregate.plantCode,
    utilityId: aggregate.utilityEiaId ? (utilityByEiaId.get(aggregate.utilityEiaId) ?? null) : null,
    utilityName: aggregate.utilityName || "Unknown",
    balancingAuthorityId: aggregate.baCode ? (baByCode.get(aggregate.baCode) ?? null) : null,
    baCode: aggregate.baCode,
    state,
    county: aggregate.county,
    latitude: aggregate.latitude,
    longitude: aggregate.longitude,
    nercRegion: null,
    sector: aggregate.sector || "Unknown",
    primaryFuel: fuelCategory,
    fuelCategory,
    technologies,
    energySources,
    totalCapacityMw: hasOperating ? roundCapacity(aggregate.operatingCapacityMw) : 0,
    generatorCount: hasOperating ? aggregate.operatingGeneratorCount : 0,
    operatingYear: hasOperating ? aggregate.oldestOperatingYear : null,
    gridVoltageKv: null,
    status: hasOperating ? "operable" : "proposed",
    proposedCapacityMw: aggregate.proposedGeneratorCount > 0 ? roundCapacity(aggregate.proposedCapacityMw) : null,
    proposedOnlineYear: aggregate.earliestProposedOnlineYear,
  };
}

function dedupeSlug(
  record: PowerPlantRecord,
  existingSlugByPlantCode: Map<string, string>,
  slugCounts: Map<string, number>
): void {
  const existingSlug = existingSlugByPlantCode.get(record.plantCode);
  if (existingSlug) {
    record.slug = existingSlug;
    slugCounts.set(existingSlug.replace(/-\d+$/, ""), (slugCounts.get(existingSlug.replace(/-\d+$/, "")) ?? 0) + 1);
    return;
  }

  const base = record.slug;
  const slugCount = slugCounts.get(base) ?? 0;
  if (slugCount > 0) record.slug = `${base}-${slugCount + 1}`;
  slugCounts.set(base, slugCount + 1);
}

function mergePowerPlants(aggregates: Map<string, PlantAggregate>): MergeStats {
  const existing = JSON.parse(fs.readFileSync(POWER_PLANTS_PATH, "utf-8")) as PowerPlantRecord[];
  const utilityByEiaId = buildUtilityLookup();
  const baByCode = buildBalancingAuthorityLookup();
  const existingByPlantCode = new Map(existing.map((plant) => [plant.plantCode, plant]));
  const existingSlugByPlantCode = new Map(existing.map((plant) => [plant.plantCode, plant.slug]));
  const mergedByPlantCode = new Map(existing.map((plant) => [plant.plantCode, plant]));
  const slugCounts = new Map<string, number>();

  for (const plant of existing) {
    slugCounts.set(plant.slug.replace(/-\d+$/, ""), (slugCounts.get(plant.slug.replace(/-\d+$/, "")) ?? 0) + 1);
  }

  const stats: MergeStats = {
    updatedPlants: 0,
    insertedPlants: 0,
    unchangedPlants: 0,
    skippedMissingCoordinates: 0,
    operatingGenerators: 0,
    plannedGenerators: 0,
    retiredGenerators: 0,
    canceledOrPostponedGenerators: 0,
    puertoRicoPlantsMerged: 0,
    puertoRicoOperatingGenerators: 0,
    puertoRicoPlannedGenerators: 0,
  };

  for (const aggregate of aggregates.values()) {
    stats.operatingGenerators += aggregate.operatingGeneratorCount;
    stats.plannedGenerators += aggregate.proposedGeneratorCount;

    // EIA-860M ships dedicated Operating_PR / Planned_PR sheets for Puerto Rico generators.
    // Track them explicitly so the sync log proves we have territory coverage, not just CONUS.
    const isPuertoRico =
      aggregate.state === "PR" ||
      aggregate.sourceSheets.has("Operating_PR") ||
      aggregate.sourceSheets.has("Planned_PR");
    if (isPuertoRico) {
      stats.puertoRicoOperatingGenerators += aggregate.operatingGeneratorCount;
      stats.puertoRicoPlannedGenerators += aggregate.proposedGeneratorCount;
    }

    const next = createPowerPlantRecord(aggregate, utilityByEiaId, baByCode);
    if (!next) {
      stats.skippedMissingCoordinates += 1;
      continue;
    }

    if (isPuertoRico) stats.puertoRicoPlantsMerged += 1;

    const existingRecord = existingByPlantCode.get(next.plantCode);
    if (existingRecord) {
      next.id = existingRecord.id;
      next.slug = existingRecord.slug;
      next.utilityId = next.utilityId ?? existingRecord.utilityId;
      next.utilityName = existingRecord.utilityName;
      next.balancingAuthorityId = next.balancingAuthorityId ?? existingRecord.balancingAuthorityId;
      next.nercRegion = existingRecord.nercRegion;
      next.gridVoltageKv = existingRecord.gridVoltageKv;

      // Annual EIA-860 is still the authoritative source for stable plant metadata.
      // EIA-860M is used here for monthly generator-level facts and to seed new plants.
      next.name = existingRecord.name;
      next.county = existingRecord.county;
      next.latitude = existingRecord.latitude;
      next.longitude = existingRecord.longitude;
      next.sector = existingRecord.sector;
      next.baCode = existingRecord.baCode;
    } else {
      dedupeSlug(next, existingSlugByPlantCode, slugCounts);
    }

    const previousJson = existingRecord ? JSON.stringify(existingRecord) : null;
    const nextJson = JSON.stringify(next);
    if (!existingRecord) stats.insertedPlants += 1;
    else if (previousJson === nextJson) stats.unchangedPlants += 1;
    else stats.updatedPlants += 1;

    mergedByPlantCode.set(next.plantCode, next);
  }

  const merged = Array.from(mergedByPlantCode.values());
  merged.sort((a, b) => {
    const capA = a.status === "operable" ? a.totalCapacityMw : (a.proposedCapacityMw ?? 0);
    const capB = b.status === "operable" ? b.totalCapacityMw : (b.proposedCapacityMw ?? 0);
    return capB - capA;
  });

  fs.writeFileSync(POWER_PLANTS_PATH, `${JSON.stringify(merged)}\n`);
  return stats;
}

function updateManifest(
  latest: LatestMonthlyFile,
  localPath: string,
  checksumSha256: string,
  sheetRowCounts: Record<RequiredSheet, number>,
  previous: Eia860mManifest | null
): void {
  const now = new Date().toISOString();
  const localRelativePath = path.relative(REPO_ROOT, localPath);
  const entry: ManifestFileEntry = {
    file_name: latest.fileName,
    file_url: latest.fileUrl,
    month: latest.monthIso,
    month_label: latest.monthLabel,
    file_size_bytes: fs.statSync(localPath).size,
    checksum_sha256: checksumSha256,
    local_path: localRelativePath,
    parsed_at: now,
    sheet_row_counts: sheetRowCounts,
  };

  const files = (previous?.files ?? []).filter((file) => file.file_name !== latest.fileName);
  files.push(entry);
  files.sort((a, b) => fileSortKey(a.file_name) - fileSortKey(b.file_name));

  const manifest: Eia860mManifest = {
    source: previous?.source ?? "EIA Form 860M — Preliminary Monthly Electric Generator Inventory",
    source_page: EIA_860M_PAGE,
    latest_month: latest.monthIso,
    latest_month_label: latest.monthLabel,
    file_name: latest.fileName,
    file_url: latest.fileUrl,
    file_date: previous?.file_name === latest.fileName ? previous.file_date : undefined,
    file_release_date_iso: previous?.file_name === latest.fileName ? previous.file_release_date_iso : undefined,
    next_release_date: previous?.next_release_date,
    file_size_bytes: entry.file_size_bytes,
    checksum_sha256: entry.checksum_sha256,
    local_path: entry.local_path,
    sheets: [...REQUIRED_SHEETS],
    sheet_row_counts: sheetRowCounts,
    files,
    notes: previous?.notes ?? [
      "EIA-860M is the monthly supplement to the annual Form EIA-860; it tracks generator status, new builds, retirements, and capacity revisions between annual releases.",
      "Sheets _PR contain Puerto Rico generators (added starting March 2018 data).",
      "Retired sheet contains comprehensive list of generators retired since 2002 (since March 2017 data).",
      "Capacities are preliminary estimates; final inventory comes from annual EIA-860.",
    ],
    captured_at: previous?.captured_at,
    captured_by: previous?.captured_by,
    updated_at: now,
  };

  fs.mkdirSync(EIA_860M_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  console.log("Syncing EIA-860M monthly power plant updates\n");

  const manifest = readManifest();
  const latest = await checkLatestMonth();
  if (!latest) {
    console.log("\nNo updates available. Exiting.");
    return;
  }

  const localPath = await ensureMonthlyFile(latest, manifest);
  const checksumSha256 = sha256File(localPath);
  const markerPayload = `${latest.fileName}\n${checksumSha256}`;

  if (fs.existsSync(LAST_SYNC_MARKER_PATH)) {
    const markerLines = fs.readFileSync(LAST_SYNC_MARKER_PATH, "utf-8").trim().split(/\r?\n/);
    if (markerLines[0] === latest.fileName && markerLines[1] === checksumSha256) {
      console.log(`\nAlready synced ${latest.fileName}. No update needed.`);
      return;
    }
  }

  console.log("\nParsing EIA-860M workbook...");
  const { rows, sheetRowCounts } = parseEia860mWorkbook(localPath);
  const retiredCount = rows.filter((row) => row.kind === "retired").length;
  const canceledOrPostponedCount = rows.filter((row) => row.kind === "canceled_or_postponed").length;

  console.log("\nMerging operating/planned generators into data/power-plants.json...");
  const aggregates = aggregateGenerators(rows);
  const stats = mergePowerPlants(aggregates);
  stats.retiredGenerators = retiredCount;
  stats.canceledOrPostponedGenerators = canceledOrPostponedCount;

  updateManifest(latest, localPath, checksumSha256, sheetRowCounts, manifest);
  fs.writeFileSync(LAST_SYNC_MARKER_PATH, `${markerPayload}\n${new Date().toISOString()}\n`);

  console.log("\nEIA-860M sync complete:");
  console.log(`  Latest file: ${latest.fileName}`);
  console.log(`  Parsed rows: ${rows.length.toLocaleString()}`);
  console.log(`  Updated plants: ${stats.updatedPlants.toLocaleString()}`);
  console.log(`  Inserted plants: ${stats.insertedPlants.toLocaleString()}`);
  console.log(`  Unchanged plants: ${stats.unchangedPlants.toLocaleString()}`);
  console.log(`  Skipped plants missing coordinates: ${stats.skippedMissingCoordinates.toLocaleString()}`);
  console.log(`  Retired generators observed: ${stats.retiredGenerators.toLocaleString()}`);
  console.log(`  Canceled/postponed generators observed: ${stats.canceledOrPostponedGenerators.toLocaleString()}`);
  console.log(
    `  Puerto Rico plants merged: ${stats.puertoRicoPlantsMerged.toLocaleString()} ` +
      `(${stats.puertoRicoOperatingGenerators.toLocaleString()} operating + ` +
      `${stats.puertoRicoPlannedGenerators.toLocaleString()} planned generators from _PR sheets)`
  );
}

const invokedDirectly = (() => {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("sync-power-plants-monthly.ts") || entry.endsWith("sync-power-plants-monthly.js");
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Monthly sync failed:", err);
    process.exit(1);
  });
}
