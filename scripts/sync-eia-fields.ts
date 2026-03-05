/**
 * Sync script: Populate utility fields from EIA-861 2024 xlsx files.
 *
 * Reads the following EIA-861 files and enriches utilities.json:
 *   - Utility_Data_2024.xlsx     → nercRegion, hasGeneration, hasTransmission, hasDistribution
 *   - Operational_Data_2024.xlsx → peakDemandMw, winterPeakDemandMw
 *   - Sales_Ult_Cust_2024.xlsx   → baCode, totalRevenueDollars, totalSalesMwh, customerCount
 *   - Short_Form_2024.xlsx       → baCode, totalRevenueDollars, totalSalesMwh, customerCount (small utilities)
 *   - Advanced_Meters_2024.xlsx  → amiMeterCount, totalMeterCount
 *
 * Usage:
 *   cd apps/commongrid
 *   yarn sync:eia
 *
 * Prerequisites:
 *   EIA-861 2024 xlsx files in ~/Workspace/Context data/f8612024/
 *   Download from: https://www.eia.gov/electricity/data/eia861/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { readJSON, writeJSON } from "./lib";

const EIA_DATA_DIR = path.resolve(process.env.HOME!, "Workspace/Context data/f8612024");

interface UtilityRecord {
  id: string;
  slug: string;
  name: string;
  eiaId: string | null;
  customerCount: number | null;
  peakDemandMw: number | null;
  winterPeakDemandMw: number | null;
  totalRevenueDollars: number | null;
  totalSalesMwh: number | null;
  baCode: string | null;
  nercRegion: string | null;
  hasGeneration: boolean | null;
  hasTransmission: boolean | null;
  hasDistribution: boolean | null;
  amiMeterCount: number | null;
  totalMeterCount: number | null;
  [key: string]: unknown;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "" || val === ".") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseBool(val: unknown): boolean | null {
  if (val === null || val === undefined || val === "" || val === ".") return null;
  if (typeof val === "string") {
    const lower = val.trim().toUpperCase();
    if (lower === "Y" || lower === "YES") return true;
    if (lower === "N" || lower === "NO") return false;
  }
  return null;
}

function readSheet(filePath: string, sheetName: string, headerRow: number): Map<string, Record<string, unknown>> {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn(`  Warning: Sheet "${sheetName}" not found in ${path.basename(filePath)}`);
    return new Map();
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const headers = rawRows[headerRow] as string[];

  const result = new Map<string, Record<string, unknown>>();
  for (let i = headerRow + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length === 0) continue;

    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        record[String(headers[j]).trim()] = row[j];
      }
    }

    const eiaId = String(record["Utility Number"] ?? "").trim();
    if (!eiaId || eiaId === "undefined") continue;

    // For files with multiple state rows per utility, we want to aggregate.
    // Store all rows, keyed by eiaId (may overwrite — we handle aggregation below).
    result.set(eiaId, record);
  }

  return result;
}

/**
 * Sales_Ult_Cust has positional columns that repeat (Thousand Dollars, Megawatthours, Count)
 * for Residential, Commercial, Industrial, Transportation, Total.
 * The TOTAL columns are at indices 21, 22, 23 (0-indexed).
 * Row 2 is the header row with column names. Data starts at row 3.
 */
function readSalesData(
  filePath: string
): Map<
  string,
  { baCode: string | null; revenueDollars: number | null; salesMwh: number | null; customers: number | null }
> {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["States"];
  if (!sheet) return new Map();

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  // Row indices: 0 = category headers, 1 = sub-category, 2 = column names, 3+ = data
  // Column layout (0-indexed):
  //  0: Data Year, 1: Utility Number, 2: Utility Name, 3: Part, 4: Service Type,
  //  5: Data Type, 6: State, 7: Ownership, 8: BA Code,
  //  9-11: Residential (Rev, Sales, Cust), 12-14: Commercial, 15-17: Industrial,
  //  18-20: Transportation, 21-23: TOTAL (Rev $K, Sales MWh, Customers)

  const result = new Map<
    string,
    { baCode: string | null; revenueDollars: number | null; salesMwh: number | null; customers: number | null }
  >();

  for (let i = 3; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 24) continue;

    const eiaId = String(row[1] ?? "").trim();
    if (!eiaId) continue;

    const baCode = row[8] != null && row[8] !== "" && row[8] !== "." ? String(row[8]).trim() : null;
    const revenueThousands = parseNum(row[21]);
    const salesMwh = parseNum(row[22]);
    const customers = parseNum(row[23]);

    const existing = result.get(eiaId);
    if (existing) {
      // Aggregate across state rows
      if (!existing.baCode && baCode) existing.baCode = baCode;
      existing.revenueDollars =
        (existing.revenueDollars ?? 0) + (revenueThousands != null ? revenueThousands * 1000 : 0);
      existing.salesMwh = (existing.salesMwh ?? 0) + (salesMwh ?? 0);
      existing.customers = (existing.customers ?? 0) + (customers ?? 0);
    } else {
      result.set(eiaId, {
        baCode,
        revenueDollars: revenueThousands != null ? revenueThousands * 1000 : null,
        salesMwh,
        customers,
      });
    }
  }

  return result;
}

/**
 * Advanced_Meters has positional columns that repeat for different meter types.
 * Row 0 = category headers, Row 1 = column names (with repeated sector names), Row 2+ = data.
 * Key columns (0-indexed):
 *   6: BA Code
 *   AMI Total: index 16 (row 0 = "Number AMI...", cols 12-16, Total at 16)
 *   Total Meters Total: index 31 (row 0 = "Total Numbers of Meters", cols 27-31, Total at 31)
 */
function readAdvancedMeters(
  filePath: string
): Map<string, { amiTotal: number | null; metersTotal: number | null; baCode: string | null }> {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["states"];
  if (!sheet) return new Map();

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const result = new Map<string, { amiTotal: number | null; metersTotal: number | null; baCode: string | null }>();

  for (let i = 2; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 32) continue;

    const eiaId = String(row[1] ?? "").trim();
    if (!eiaId) continue;

    const baCode = row[6] != null && row[6] !== "" && row[6] !== "." ? String(row[6]).trim() : null;
    const amiTotal = parseNum(row[16]);
    const metersTotal = parseNum(row[31]);

    const existing = result.get(eiaId);
    if (existing) {
      // Aggregate across state rows
      if (!existing.baCode && baCode) existing.baCode = baCode;
      existing.amiTotal = (existing.amiTotal ?? 0) + (amiTotal ?? 0);
      existing.metersTotal = (existing.metersTotal ?? 0) + (metersTotal ?? 0);
    } else {
      result.set(eiaId, { amiTotal, metersTotal, baCode });
    }
  }

  return result;
}

/**
 * Operational_Data has positional columns.
 * Row 2 = column names. Data starts at row 3.
 * Key columns: 6 = Summer Peak Demand MW, 7 = Winter Peak Demand MW
 */
function readOperationalData(
  filePath: string
): Map<string, { summerPeakMw: number | null; winterPeakMw: number | null }> {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["States"];
  if (!sheet) return new Map();

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const result = new Map<string, { summerPeakMw: number | null; winterPeakMw: number | null }>();

  for (let i = 3; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 8) continue;

    const eiaId = String(row[1] ?? "").trim();
    if (!eiaId) continue;

    const summerPeak = parseNum(row[6]);
    const winterPeak = parseNum(row[7]);

    const existing = result.get(eiaId);
    if (existing) {
      // Take the max across state rows for peak demand
      if (summerPeak != null) existing.summerPeakMw = Math.max(existing.summerPeakMw ?? 0, summerPeak);
      if (winterPeak != null) existing.winterPeakMw = Math.max(existing.winterPeakMw ?? 0, winterPeak);
    } else {
      result.set(eiaId, { summerPeakMw: summerPeak, winterPeakMw: winterPeak });
    }
  }

  return result;
}

async function main() {
  console.log("Syncing utility fields from EIA-861 2024 data\n");

  if (!fs.existsSync(EIA_DATA_DIR)) {
    console.error(`EIA data directory not found: ${EIA_DATA_DIR}`);
    process.exit(1);
  }

  const utilities: UtilityRecord[] = readJSON("utilities.json");

  // Ensure all utilities have the new fields initialized
  for (const u of utilities) {
    if (u.winterPeakDemandMw === undefined) u.winterPeakDemandMw = null;
    if (u.totalRevenueDollars === undefined) u.totalRevenueDollars = null;
    if (u.totalSalesMwh === undefined) u.totalSalesMwh = null;
    if (u.baCode === undefined) u.baCode = null;
    if (u.nercRegion === undefined) u.nercRegion = null;
    if (u.hasGeneration === undefined) u.hasGeneration = null;
    if (u.hasTransmission === undefined) u.hasTransmission = null;
    if (u.hasDistribution === undefined) u.hasDistribution = null;
    if (u.amiMeterCount === undefined) u.amiMeterCount = null;
    if (u.totalMeterCount === undefined) u.totalMeterCount = null;
  }

  const utilitiesByEiaId = new Map<string, UtilityRecord>();
  for (const u of utilities) {
    if (u.eiaId) utilitiesByEiaId.set(u.eiaId, u);
  }

  console.log(`  Loaded ${utilities.length} utilities (${utilitiesByEiaId.size} with EIA ID)\n`);

  // ── 1. Utility_Data → nercRegion, hasGeneration, hasTransmission, hasDistribution ──
  console.log("1. Reading Utility_Data_2024.xlsx...");
  const utilityData = readSheet(
    path.join(EIA_DATA_DIR, "Utility_Data_2024.xlsx"),
    "States",
    1 // header row index
  );
  console.log(`  Loaded ${utilityData.size} utility records`);

  let nercUpdated = 0;
  let activityUpdated = 0;

  for (const [eiaId, row] of utilityData) {
    const utility = utilitiesByEiaId.get(eiaId);
    if (!utility) continue;

    const nerc = row["NERC Region"];
    if (nerc && nerc !== "." && nerc !== "") {
      utility.nercRegion = String(nerc).trim();
      nercUpdated++;
    }

    const gen = parseBool(row["Generation"]);
    const trans = parseBool(row["Transmission"]);
    const dist = parseBool(row["Distribution"]);
    if (gen !== null || trans !== null || dist !== null) {
      utility.hasGeneration = gen;
      utility.hasTransmission = trans;
      utility.hasDistribution = dist;
      activityUpdated++;
    }
  }
  console.log(`  → nercRegion: ${nercUpdated}, activity flags: ${activityUpdated}\n`);

  // ── 2. Operational_Data → peakDemandMw, winterPeakDemandMw ──
  console.log("2. Reading Operational_Data_2024.xlsx...");
  const opData = readOperationalData(path.join(EIA_DATA_DIR, "Operational_Data_2024.xlsx"));
  console.log(`  Loaded ${opData.size} operational records`);

  let peakUpdated = 0;
  for (const [eiaId, data] of opData) {
    const utility = utilitiesByEiaId.get(eiaId);
    if (!utility) continue;

    if (data.summerPeakMw != null && data.summerPeakMw > 0) {
      utility.peakDemandMw = Math.round(data.summerPeakMw * 10) / 10;
      peakUpdated++;
    }
    if (data.winterPeakMw != null && data.winterPeakMw > 0) {
      utility.winterPeakDemandMw = Math.round(data.winterPeakMw * 10) / 10;
    }
  }
  console.log(`  → peakDemandMw: ${peakUpdated}\n`);

  // ── 3. Sales_Ult_Cust → baCode, totalRevenueDollars, totalSalesMwh, customerCount ──
  console.log("3. Reading Sales_Ult_Cust_2024.xlsx...");
  const salesData = readSalesData(path.join(EIA_DATA_DIR, "Sales_Ult_Cust_2024.xlsx"));
  console.log(`  Loaded ${salesData.size} sales records`);

  let salesUpdated = 0;
  let baCodeUpdated = 0;
  let customerUpdated = 0;

  for (const [eiaId, data] of salesData) {
    const utility = utilitiesByEiaId.get(eiaId);
    if (!utility) continue;

    if (data.baCode && !utility.baCode) {
      utility.baCode = data.baCode;
      baCodeUpdated++;
    }
    if (data.revenueDollars != null && data.revenueDollars > 0) {
      utility.totalRevenueDollars = Math.round(data.revenueDollars);
      salesUpdated++;
    }
    if (data.salesMwh != null && data.salesMwh > 0) {
      utility.totalSalesMwh = Math.round(data.salesMwh);
    }
    if (data.customers != null && data.customers > 0) {
      // Update customerCount if we don't have one or if EIA data is newer
      if (utility.customerCount === null) {
        utility.customerCount = Math.round(data.customers);
        customerUpdated++;
      }
    }
  }
  console.log(`  → revenue: ${salesUpdated}, baCode: ${baCodeUpdated}, customers (filled gaps): ${customerUpdated}\n`);

  // ── 4. Short_Form → fill gaps for small utilities ──
  console.log("4. Reading Short_Form_2024.xlsx...");
  const shortFormData = readSheet(
    path.join(EIA_DATA_DIR, "Short_Form_2024.xlsx"),
    "861S",
    0 // single header at row 0
  );
  console.log(`  Loaded ${shortFormData.size} short form records`);

  let shortFormFilled = 0;
  for (const [eiaId, row] of shortFormData) {
    const utility = utilitiesByEiaId.get(eiaId);
    if (!utility) continue;

    const baCode = row["BA Code"];
    if (baCode && baCode !== "." && baCode !== "" && !utility.baCode) {
      utility.baCode = String(baCode).trim();
    }

    const revThousands = parseNum(row["Total Revenue (Thousand Dollars)"]);
    if (revThousands != null && revThousands > 0 && utility.totalRevenueDollars === null) {
      utility.totalRevenueDollars = Math.round(revThousands * 1000);
      shortFormFilled++;
    }

    const salesMwh = parseNum(row["Total Sales (MWh)"]);
    if (salesMwh != null && salesMwh > 0 && utility.totalSalesMwh === null) {
      utility.totalSalesMwh = Math.round(salesMwh);
    }

    const customers = parseNum(row["Total Customers"]);
    if (customers != null && customers > 0 && utility.customerCount === null) {
      utility.customerCount = Math.round(customers);
    }
  }
  console.log(`  → filled ${shortFormFilled} revenue gaps from short form\n`);

  // ── 5. Advanced_Meters → amiMeterCount, totalMeterCount ──
  console.log("5. Reading Advanced_Meters_2024.xlsx...");
  const metersData = readAdvancedMeters(path.join(EIA_DATA_DIR, "Advanced_Meters_2024.xlsx"));
  console.log(`  Loaded ${metersData.size} meter records`);

  let amiUpdated = 0;
  let metersUpdatedCount = 0;

  for (const [eiaId, data] of metersData) {
    const utility = utilitiesByEiaId.get(eiaId);
    if (!utility) continue;

    if (data.baCode && !utility.baCode) {
      utility.baCode = data.baCode;
    }
    if (data.amiTotal != null && data.amiTotal > 0) {
      utility.amiMeterCount = Math.round(data.amiTotal);
      amiUpdated++;
    }
    if (data.metersTotal != null && data.metersTotal > 0) {
      utility.totalMeterCount = Math.round(data.metersTotal);
      metersUpdatedCount++;
    }
  }
  console.log(`  → AMI meters: ${amiUpdated}, total meters: ${metersUpdatedCount}\n`);

  // ── 6. Reorder keys to match Utility interface and write ──────────────
  const keyOrder = [
    "id",
    "slug",
    "name",
    "eiaName",
    "shortName",
    "logo",
    "website",
    "eiaId",
    "segment",
    "status",
    "customerCount",
    "peakDemandMw",
    "winterPeakDemandMw",
    "totalRevenueDollars",
    "totalSalesMwh",
    "baCode",
    "nercRegion",
    "hasGeneration",
    "hasTransmission",
    "hasDistribution",
    "amiMeterCount",
    "totalMeterCount",
    "jurisdiction",
    "isoId",
    "rtoId",
    "balancingAuthorityId",
    "generationProviderId",
    "transmissionProviderId",
    "parentId",
    "successorId",
    "serviceTerritoryId",
    "notionPageId",
  ];

  const ordered = utilities.map((u) => {
    const obj: Record<string, unknown> = {};
    for (const key of keyOrder) {
      obj[key] = (u as Record<string, unknown>)[key] ?? null;
    }
    return obj;
  });

  writeJSON("utilities.json", ordered);

  // ── Summary ──────────────────────────────────────────────────────────────
  const withPeak = utilities.filter((u) => u.peakDemandMw != null).length;
  const withRevenue = utilities.filter((u) => u.totalRevenueDollars != null).length;
  const withSales = utilities.filter((u) => u.totalSalesMwh != null).length;
  const withBaCode = utilities.filter((u) => u.baCode != null).length;
  const withNerc = utilities.filter((u) => u.nercRegion != null).length;
  const withActivity = utilities.filter((u) => u.hasGeneration != null).length;
  const withAmi = utilities.filter((u) => u.amiMeterCount != null).length;
  const withMeters = utilities.filter((u) => u.totalMeterCount != null).length;
  const withCustomers = utilities.filter((u) => u.customerCount != null).length;

  console.log("Sync complete. Field coverage:");
  console.log(`  peakDemandMw:       ${withPeak} / ${utilities.length} (${pct(withPeak, utilities.length)})`);
  console.log(
    `  winterPeakDemandMw: ${utilities.filter((u) => u.winterPeakDemandMw != null).length} / ${utilities.length}`
  );
  console.log(`  totalRevenueDollars: ${withRevenue} / ${utilities.length} (${pct(withRevenue, utilities.length)})`);
  console.log(`  totalSalesMwh:      ${withSales} / ${utilities.length} (${pct(withSales, utilities.length)})`);
  console.log(`  baCode:             ${withBaCode} / ${utilities.length} (${pct(withBaCode, utilities.length)})`);
  console.log(`  nercRegion:         ${withNerc} / ${utilities.length} (${pct(withNerc, utilities.length)})`);
  console.log(`  activity flags:     ${withActivity} / ${utilities.length} (${pct(withActivity, utilities.length)})`);
  console.log(`  amiMeterCount:      ${withAmi} / ${utilities.length} (${pct(withAmi, utilities.length)})`);
  console.log(`  totalMeterCount:    ${withMeters} / ${utilities.length} (${pct(withMeters, utilities.length)})`);
  console.log(`  customerCount:      ${withCustomers} / ${utilities.length} (${pct(withCustomers, utilities.length)})`);
}

function pct(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
