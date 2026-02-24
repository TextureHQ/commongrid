/**
 * Sync script: Download and parse EIA-860 Annual Electric Generator Report.
 *
 * Downloads the EIA-860 ZIP, extracts plant and generator XLSX files,
 * and builds a complete power plants dataset with:
 *   - Plant-level data: location, BA, utility, grid voltage
 *   - Generator-level aggregation: capacity, technologies, fuels, operating year
 *   - Proposed generators: planned capacity, expected online date
 *   - Linkage to utilities.json and balancing-authorities.json
 *
 * Usage:
 *   cd opengrid
 *   npx tsx scripts/sync-power-plants.ts
 *
 * Output:
 *   data/power-plants.json
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { readJSON, slugify, writeJSON } from "./lib";

const EIA_860_URL = "https://www.eia.gov/electricity/data/eia860/xls/eia8602024.zip";
const TEMP_DIR = path.join(os.tmpdir(), "eia860-sync");

// ── Fuel code → category mapping ──────────────────────────────────────────

const FUEL_CODE_TO_CATEGORY: Record<string, string> = {
  // Solar
  SUN: "Solar",
  // Wind
  WND: "Wind",
  // Nuclear
  NUC: "Nuclear",
  // Natural Gas
  NG: "Natural Gas",
  // Coal
  BIT: "Coal",
  SUB: "Coal",
  LIG: "Coal",
  RC: "Coal",
  ANT: "Coal",
  COL: "Coal",
  // Petroleum
  DFO: "Petroleum",
  RFO: "Petroleum",
  JF: "Petroleum",
  KER: "Petroleum",
  PC: "Petroleum",
  PG: "Petroleum",
  WO: "Petroleum",
  // Hydro
  WAT: "Hydro",
  // Battery Storage
  MWH: "Battery Storage",
  // Biomass / Other
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

// Technology code → human-readable name
const TECH_TO_NAME: Record<string, string> = {
  BA: "Battery Storage",
  BT: "Binary Cycle Turbine",
  CA: "Combined Cycle Steam",
  CE: "Compressed Air Storage",
  CP: "Concentrated Solar Power",
  CS: "Combined Cycle Single Shaft",
  CT: "Combined Cycle Combustion Turbine",
  ES: "Energy Storage (Other)",
  FC: "Fuel Cell",
  FW: "Flywheel Storage",
  GT: "Gas Combustion Turbine",
  HA: "Hydrokinetic (Axial Flow)",
  HB: "Hydrokinetic (Wave Buoy)",
  HK: "Hydrokinetic (Other)",
  HY: "Hydraulic Turbine",
  IC: "Internal Combustion Engine",
  OT: "Other",
  PS: "Pumped Storage",
  PV: "Photovoltaic",
  ST: "Steam Turbine",
  WT: "Wind Turbine (Onshore)",
  WS: "Wind Turbine (Offshore)",
};

interface PlantRow {
  plantCode: string;
  name: string;
  utilityId: string;
  utilityName: string;
  state: string;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  nercRegion: string | null;
  baCode: string | null;
  baName: string | null;
  sector: string;
  gridVoltageKv: number | null;
}

interface GeneratorRow {
  plantCode: string;
  generatorId: string;
  technology: string;
  energySource: string;
  nameplateMw: number;
  operatingYear: number | null;
  status: string;
}

interface ProposedGeneratorRow {
  plantCode: string;
  generatorId: string;
  technology: string;
  energySource: string;
  nameplateMw: number;
  proposedOnlineYear: number | null;
  status: string;
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

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "" || val === ".") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined || val === "" || val === ".") return null;
  return String(val).trim();
}

function getFuelCategory(energySources: string[]): string {
  // Pick the dominant fuel based on priority
  for (const source of energySources) {
    const cat = FUEL_CODE_TO_CATEGORY[source];
    if (cat) return cat;
  }
  return "Biomass/Other";
}

function getPrimaryFuel(fuelCategory: string): string {
  return fuelCategory;
}

function getTechName(code: string): string {
  return TECH_TO_NAME[code] ?? code;
}

function plantSlugify(name: string, state: string, plantCode: string): string {
  const base = slugify(name, { normalizeEmDashes: true, stripParentheticals: true });
  if (!base || base.length < 2) return `plant-${plantCode}`;
  return `${base}-${state.toLowerCase()}`;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`  Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

function readPlantSheet(filePath: string): Map<string, PlantRow> {
  console.log("  Parsing plant sheet...");
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes("plant"));
  if (!sheetName) throw new Error("Plant sheet not found");

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

  // Find header row (usually row 1 or 2, look for "Plant Code")
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = rawRows[i] as string[];
    if (row?.some((cell) => String(cell ?? "").includes("Plant Code"))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("Could not find header row in plant sheet");

  const headers = (rawRows[headerRowIdx] as string[]).map((h) => String(h ?? "").trim());
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const iPlantCode = col("Plant Code");
  const iPlantName = col("Plant Name");
  const iUtilityId = col("Utility ID");
  const iUtilityName = col("Utility Name");
  const iState = col("State");
  const iCounty = col("County");
  const iLat = col("Latitude");
  const iLon = col("Longitude");
  const iNerc = col("NERC Region");
  const iBaCode = col("Balancing Authority Code");
  const iBaName = col("Balancing Authority Name");
  const iSector = col("Sector Name");
  const iGridVoltage = col("Grid Voltage");

  const plants = new Map<string, PlantRow>();

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 5) continue;

    const plantCode = parseStr(row[iPlantCode]);
    if (!plantCode) continue;

    const lat = parseNum(row[iLat]);
    const lon = parseNum(row[iLon]);
    const state = parseStr(row[iState]);
    if (!state) continue;

    plants.set(plantCode, {
      plantCode,
      name: String(row[iPlantName] ?? "").trim(),
      utilityId: String(row[iUtilityId] ?? "").trim(),
      utilityName: String(row[iUtilityName] ?? "").trim(),
      state,
      county: parseStr(row[iCounty]),
      latitude: lat,
      longitude: lon,
      nercRegion: parseStr(row[iNerc]),
      baCode: parseStr(row[iBaCode]),
      baName: parseStr(row[iBaName]),
      sector: String(row[iSector] ?? "").trim(),
      gridVoltageKv: parseNum(row[iGridVoltage]),
    });
  }

  console.log(`  Found ${plants.size} plants`);
  return plants;
}

function readGeneratorSheet(filePath: string, sheetName: string): GeneratorRow[] {
  console.log(`  Parsing generator sheet: ${sheetName}...`);
  const wb = XLSX.readFile(filePath);

  // Find the matching sheet
  const sheet = wb.SheetNames.find((s) => s.toLowerCase().includes(sheetName.toLowerCase()));
  if (!sheet) {
    console.warn(`  Warning: Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`);
    return [];
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });

  // Find header row
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = rawRows[i] as string[];
    if (row?.some((cell) => String(cell ?? "").includes("Plant Code"))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    console.warn(`  Warning: Could not find header row in ${sheetName}`);
    return [];
  }

  const headers = (rawRows[headerRowIdx] as string[]).map((h) => String(h ?? "").trim());
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const iPlantCode = col("Plant Code");
  const iGeneratorId = col("Generator ID");
  const iTechnology = col("Technology");
  const iEnergySource = col("Energy Source");
  // Look for nameplate capacity
  let iNameplate = headers.findIndex(
    (h) => h.toLowerCase().includes("nameplate") && h.toLowerCase().includes("capacity")
  );
  if (iNameplate === -1) iNameplate = col("Nameplate");
  const iOperatingYear = col("Operating Year");
  const iStatus = col("Status");

  const generators: GeneratorRow[] = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 5) continue;

    const plantCode = parseStr(row[iPlantCode]);
    if (!plantCode) continue;

    const nameplateMw = parseNum(row[iNameplate]);
    if (nameplateMw === null || nameplateMw <= 0) continue;

    generators.push({
      plantCode,
      generatorId: String(row[iGeneratorId] ?? "").trim(),
      technology: String(row[iTechnology] ?? "").trim(),
      energySource: String(row[iEnergySource >= 0 ? iEnergySource : 0] ?? "").trim(),
      nameplateMw,
      operatingYear: parseNum(row[iOperatingYear]),
      status: String(row[iStatus >= 0 ? iStatus : 0] ?? "").trim(),
    });
  }

  console.log(`  Found ${generators.length} generators`);
  return generators;
}

function readProposedGeneratorSheet(filePath: string): ProposedGeneratorRow[] {
  console.log("  Parsing proposed generators...");
  const wb = XLSX.readFile(filePath);

  // Look for "Proposed" sheet
  const sheet = wb.SheetNames.find((s) => s.toLowerCase().includes("proposed"));
  if (!sheet) {
    console.warn(`  Warning: Proposed sheet not found. Available: ${wb.SheetNames.join(", ")}`);
    return [];
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });

  // Find header row
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = rawRows[i] as string[];
    if (row?.some((cell) => String(cell ?? "").includes("Plant Code"))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    console.warn("  Warning: Could not find header row in Proposed sheet");
    return [];
  }

  const headers = (rawRows[headerRowIdx] as string[]).map((h) => String(h ?? "").trim());
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const iPlantCode = col("Plant Code");
  const iGeneratorId = col("Generator ID");
  const iTechnology = col("Technology");
  const iEnergySource = col("Energy Source");
  let iNameplate = headers.findIndex(
    (h) => h.toLowerCase().includes("nameplate") && h.toLowerCase().includes("capacity")
  );
  if (iNameplate === -1) iNameplate = col("Nameplate");
  // Look for proposed online year columns
  let iOnlineYear = col("Planned Operation Year");
  if (iOnlineYear === -1) iOnlineYear = col("Effective Year");
  if (iOnlineYear === -1) iOnlineYear = col("Online Year");
  const iStatus = col("Status");

  const generators: ProposedGeneratorRow[] = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 5) continue;

    const plantCode = parseStr(row[iPlantCode]);
    if (!plantCode) continue;

    const nameplateMw = parseNum(row[iNameplate]);
    if (nameplateMw === null || nameplateMw <= 0) continue;

    generators.push({
      plantCode,
      generatorId: String(row[iGeneratorId] ?? "").trim(),
      technology: String(row[iTechnology] ?? "").trim(),
      energySource: String(row[iEnergySource >= 0 ? iEnergySource : 0] ?? "").trim(),
      nameplateMw,
      proposedOnlineYear: iOnlineYear >= 0 ? parseNum(row[iOnlineYear]) : null,
      status: String(row[iStatus >= 0 ? iStatus : 0] ?? "").trim(),
    });
  }

  console.log(`  Found ${generators.length} proposed generators`);
  return generators;
}

async function main() {
  console.log("Syncing power plants from EIA-860 Annual Data\n");

  // ── 1. Download EIA-860 ZIP ─────────────────────────────────────────
  console.log("1. Downloading EIA-860 data...");
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const zipPath = path.join(TEMP_DIR, "eia860.zip");

  try {
    await downloadFile(EIA_860_URL, zipPath);
  } catch (err) {
    console.error(`  Download failed: ${err}`);
    console.log("  Will attempt to use cached data if available...");
    if (!fs.existsSync(zipPath)) {
      console.error("  No cached ZIP file found. Exiting.");
      process.exit(1);
    }
  }

  // ── 2. Extract XLSX files ──────────────────────────────────────────
  console.log("\n2. Extracting ZIP...");
  const zip = new AdmZip(zipPath);
  const extractDir = path.join(TEMP_DIR, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });
  zip.extractAllTo(extractDir, true);

  const extractedFiles = fs.readdirSync(extractDir);
  console.log(`  Extracted ${extractedFiles.length} files: ${extractedFiles.join(", ")}`);

  // Find plant file (2___Plant_Y2024.xlsx)
  const plantFile = extractedFiles.find(
    (f) => f.toLowerCase().includes("plant") && f.endsWith(".xlsx") && !f.startsWith("~")
  );
  if (!plantFile) throw new Error("Plant XLSX file not found in ZIP");

  // Find generator file (3_1_Generator_Y2024.xlsx)
  const genFile = extractedFiles.find(
    (f) => f.toLowerCase().includes("generator") && f.endsWith(".xlsx") && !f.startsWith("~")
  );
  if (!genFile) throw new Error("Generator XLSX file not found in ZIP");

  console.log(`  Plant file: ${plantFile}`);
  console.log(`  Generator file: ${genFile}`);

  // ── 3. Parse plant data ────────────────────────────────────────────
  console.log("\n3. Parsing plant data...");
  const plants = readPlantSheet(path.join(extractDir, plantFile));

  // ── 4. Parse operable generators ──────────────────────────────────
  console.log("\n4. Parsing operable generators...");
  const operableGenerators = readGeneratorSheet(path.join(extractDir, genFile), "Operable");

  // ── 5. Parse proposed generators ──────────────────────────────────
  console.log("\n5. Parsing proposed generators...");
  const proposedGenerators = readProposedGeneratorSheet(path.join(extractDir, genFile));

  // ── 6. Load existing data for linkage ─────────────────────────────
  console.log("\n6. Loading existing data for linkage...");
  interface UtilityForLink {
    id: string;
    eiaId: string | null;
    slug: string;
    name: string;
  }
  interface BAForLink {
    id: string;
    eiaCode: string | null;
    slug: string;
    name: string;
  }

  const utilities: UtilityForLink[] = readJSON("utilities.json");
  const bas: BAForLink[] = readJSON("balancing-authorities.json");

  const utilityByEiaId = new Map<string, UtilityForLink>();
  for (const u of utilities) {
    if (u.eiaId) utilityByEiaId.set(u.eiaId, u);
  }

  const baByCode = new Map<string, BAForLink>();
  for (const ba of bas) {
    if (ba.eiaCode) baByCode.set(ba.eiaCode, ba);
  }

  console.log(`  ${utilityByEiaId.size} utilities with EIA ID, ${baByCode.size} BAs with EIA code`);

  // ── 7. Aggregate generators by plant ──────────────────────────────
  console.log("\n7. Aggregating generators by plant...");

  // Group operable generators by plant
  const opGenByPlant = new Map<
    string,
    { totalMw: number; count: number; techs: Set<string>; fuels: Set<string>; oldestYear: number | null }
  >();

  for (const gen of operableGenerators) {
    const existing = opGenByPlant.get(gen.plantCode);
    if (existing) {
      existing.totalMw += gen.nameplateMw;
      existing.count++;
      if (gen.technology) existing.techs.add(gen.technology);
      if (gen.energySource) existing.fuels.add(gen.energySource);
      if (gen.operatingYear !== null) {
        if (existing.oldestYear === null || gen.operatingYear < existing.oldestYear) {
          existing.oldestYear = gen.operatingYear;
        }
      }
    } else {
      opGenByPlant.set(gen.plantCode, {
        totalMw: gen.nameplateMw,
        count: 1,
        techs: new Set(gen.technology ? [gen.technology] : []),
        fuels: new Set(gen.energySource ? [gen.energySource] : []),
        oldestYear: gen.operatingYear,
      });
    }
  }

  // Group proposed generators by plant
  const propGenByPlant = new Map<
    string,
    { totalMw: number; count: number; techs: Set<string>; fuels: Set<string>; earliestYear: number | null }
  >();

  for (const gen of proposedGenerators) {
    const existing = propGenByPlant.get(gen.plantCode);
    if (existing) {
      existing.totalMw += gen.nameplateMw;
      existing.count++;
      if (gen.technology) existing.techs.add(gen.technology);
      if (gen.energySource) existing.fuels.add(gen.energySource);
      if (gen.proposedOnlineYear !== null) {
        if (existing.earliestYear === null || gen.proposedOnlineYear < existing.earliestYear) {
          existing.earliestYear = gen.proposedOnlineYear;
        }
      }
    } else {
      propGenByPlant.set(gen.plantCode, {
        totalMw: gen.nameplateMw,
        count: 1,
        techs: new Set(gen.technology ? [gen.technology] : []),
        fuels: new Set(gen.energySource ? [gen.energySource] : []),
        earliestYear: gen.proposedOnlineYear,
      });
    }
  }

  // ── 8. Build power plant records ──────────────────────────────────
  console.log("\n8. Building power plant records...");
  const powerPlants: PowerPlantRecord[] = [];
  const slugsSeen = new Map<string, number>();

  // Track unique plants that will get both operable and proposed entries,
  // vs plants that are only proposed
  const operablePlantCodes = new Set(opGenByPlant.keys());
  const proposedOnlyPlantCodes = new Set<string>();

  for (const plantCode of propGenByPlant.keys()) {
    if (!operablePlantCodes.has(plantCode)) {
      proposedOnlyPlantCodes.add(plantCode);
    }
  }

  // First: Create operable plant records
  for (const [plantCode, genAgg] of opGenByPlant) {
    const plantData = plants.get(plantCode);
    if (!plantData) continue;
    if (plantData.latitude === null || plantData.longitude === null) continue;

    const fuelsArr = Array.from(genAgg.fuels);
    const techsArr = Array.from(genAgg.techs);
    const fuelCategory = getFuelCategory(fuelsArr);

    // Resolve linkages
    const utilityLink = utilityByEiaId.get(plantData.utilityId);
    const baLink = plantData.baCode ? baByCode.get(plantData.baCode) : null;

    // Generate unique slug
    let slug = plantSlugify(plantData.name, plantData.state, plantCode);
    const slugCount = slugsSeen.get(slug) ?? 0;
    if (slugCount > 0) {
      slug = `${slug}-${slugCount + 1}`;
    }
    slugsSeen.set(slug.replace(/-\d+$/, ""), slugCount + 1);

    // Check if this plant also has proposed capacity
    const propAgg = propGenByPlant.get(plantCode);

    powerPlants.push({
      id: `plant-${plantCode}`,
      slug,
      name: plantData.name,
      plantCode,
      utilityId: utilityLink?.id ?? null,
      utilityName: plantData.utilityName,
      balancingAuthorityId: baLink?.id ?? null,
      baCode: plantData.baCode,
      state: plantData.state,
      county: plantData.county,
      latitude: plantData.latitude,
      longitude: plantData.longitude,
      nercRegion: plantData.nercRegion,
      sector: plantData.sector,
      primaryFuel: getPrimaryFuel(fuelCategory),
      fuelCategory,
      technologies: techsArr.map(getTechName),
      energySources: fuelsArr,
      totalCapacityMw: Math.round(genAgg.totalMw * 10) / 10,
      generatorCount: genAgg.count,
      operatingYear: genAgg.oldestYear,
      gridVoltageKv: plantData.gridVoltageKv,
      status: "operable",
      proposedCapacityMw: propAgg ? Math.round(propAgg.totalMw * 10) / 10 : null,
      proposedOnlineYear: propAgg?.earliestYear ?? null,
    });
  }

  // Then: Create proposed-only plant records
  for (const plantCode of proposedOnlyPlantCodes) {
    const plantData = plants.get(plantCode);
    if (!plantData) continue;
    if (plantData.latitude === null || plantData.longitude === null) continue;

    const propAgg = propGenByPlant.get(plantCode)!;
    const fuelsArr = Array.from(propAgg.fuels);
    const techsArr = Array.from(propAgg.techs);
    const fuelCategory = getFuelCategory(fuelsArr);

    const utilityLink = utilityByEiaId.get(plantData.utilityId);
    const baLink = plantData.baCode ? baByCode.get(plantData.baCode) : null;

    let slug = plantSlugify(plantData.name, plantData.state, plantCode);
    const slugCount = slugsSeen.get(slug) ?? 0;
    if (slugCount > 0) {
      slug = `${slug}-${slugCount + 1}`;
    }
    slugsSeen.set(slug.replace(/-\d+$/, ""), slugCount + 1);

    powerPlants.push({
      id: `plant-${plantCode}`,
      slug,
      name: plantData.name,
      plantCode,
      utilityId: utilityLink?.id ?? null,
      utilityName: plantData.utilityName,
      balancingAuthorityId: baLink?.id ?? null,
      baCode: plantData.baCode,
      state: plantData.state,
      county: plantData.county,
      latitude: plantData.latitude,
      longitude: plantData.longitude,
      nercRegion: plantData.nercRegion,
      sector: plantData.sector,
      primaryFuel: getPrimaryFuel(fuelCategory),
      fuelCategory,
      technologies: techsArr.map(getTechName),
      energySources: fuelsArr,
      totalCapacityMw: 0,
      generatorCount: 0,
      operatingYear: null,
      gridVoltageKv: plantData.gridVoltageKv,
      status: "proposed",
      proposedCapacityMw: Math.round(propAgg.totalMw * 10) / 10,
      proposedOnlineYear: propAgg.earliestYear,
    });
  }

  // Sort by capacity descending for a sensible default order
  powerPlants.sort((a, b) => {
    const capA = a.status === "operable" ? a.totalCapacityMw : (a.proposedCapacityMw ?? 0);
    const capB = b.status === "operable" ? b.totalCapacityMw : (b.proposedCapacityMw ?? 0);
    return capB - capA;
  });

  // ── 9. Write output ───────────────────────────────────────────────
  console.log("\n9. Writing output...");
  // Write compact JSON (no indentation) since this file is 8+ MB
  const outPath = path.join(process.cwd(), "data", "power-plants.json");
  fs.writeFileSync(outPath, `${JSON.stringify(powerPlants)}\n`);
  console.log(`  Wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // ── Summary ────────────────────────────────────────────────────────
  const operable = powerPlants.filter((p) => p.status === "operable");
  const proposed = powerPlants.filter((p) => p.status === "proposed");
  const withUtility = powerPlants.filter((p) => p.utilityId !== null);
  const withBA = powerPlants.filter((p) => p.balancingAuthorityId !== null);

  const fuelCounts = new Map<string, number>();
  for (const p of powerPlants) {
    fuelCounts.set(p.fuelCategory, (fuelCounts.get(p.fuelCategory) ?? 0) + 1);
  }

  const totalCapacity = operable.reduce((sum, p) => sum + p.totalCapacityMw, 0);

  console.log("\nSync complete:");
  console.log(`  Total plants: ${powerPlants.length}`);
  console.log(`  Operable: ${operable.length}`);
  console.log(`  Proposed only: ${proposed.length}`);
  console.log(`  Total operable capacity: ${(totalCapacity / 1000).toFixed(0)} GW`);
  console.log(`  With utility linkage: ${withUtility.length}`);
  console.log(`  With BA linkage: ${withBA.length}`);
  console.log("\n  By fuel category:");
  for (const [cat, count] of [...fuelCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  // Cleanup temp directory
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
