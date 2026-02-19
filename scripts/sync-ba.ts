/**
 * Sync script: Download Balancing Authority territory boundaries from the HIFLD
 * Control Areas ArcGIS FeatureServer and build a complete BA dataset.
 *
 * Data sources:
 *   - HIFLD Control Areas (boundaries):
 *     https://hifld-geoplatform.opendata.arcgis.com/datasets/geoplatform::control-areas
 *   - EIA-861 Balancing_Authority_2024.xlsx (BA codes + states)
 *
 * Usage:
 *   cd apps/opengrid
 *   yarn sync:ba
 *
 * Outputs:
 *   - data/balancing-authorities.json — Complete BA records with EIA codes
 *   - data/regions.json — Updated with BA_TERRITORY region records
 *   - data/utilities.json — Updated with balancingAuthorityId references
 *   - public/data/territories/ba-{slug}.json — Individual GeoJSON per BA
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import * as XLSX from "xlsx";
import { readJSON, slugify, TERRITORIES_DIR, writeJSON, writeTerritory } from "./lib";

const HIFLD_CONTROL_AREAS_URL =
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Control_Areas/FeatureServer/0/query";

const EIA_DATA_DIR = path.resolve(process.env.HOME!, "Workspace/Context data/f8612024");

interface HifldProperties {
  OBJECTID_1: number;
  ID: string;
  NAME: string;
  STATE: string;
  WEBSITE: string | null;
  TOTAL_CAP: number | null;
  PEAK_LOAD: number | null;
}

interface EiaBa {
  eiaId: string;
  code: string;
  name: string;
  states: string[];
}

interface BaRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  eiaCode: string | null;
  eiaId: string | null;
  website: string | null;
  states: string[];
  isoId: string | null;
  regionId: string | null;
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
  baCode: string | null;
  balancingAuthorityId: string | null;
  [key: string]: unknown;
}

interface IsoRecord {
  id: string;
  slug: string;
  shortName: string;
  [key: string]: unknown;
}

// Mapping from EIA BA Code → ISO slug for linking BAs to their parent ISO/RTO
const BA_TO_ISO: Record<string, string> = {
  // CAISO members
  CISO: "caiso",
  // PJM members
  PJM: "pjm",
  // MISO members
  MISO: "miso",
  // ERCOT
  ERCO: "ercot",
  // ISO-NE
  ISNE: "iso-ne",
  // NYISO
  NYIS: "nyiso",
  // SPP members
  SWPP: "spp",
};

// Well-known short names / display names for BAs
const BA_SHORT_NAMES: Record<string, string> = {
  AECI: "AECI",
  AMPL: "AMPL",
  AVA: "Avista",
  AZPS: "APS",
  BANC: "BANC",
  BPAT: "BPA",
  CEA: "CEA",
  CHPD: "Chelan PUD",
  CISO: "CAISO",
  CPLE: "DEP East",
  CPLW: "DEP West",
  DEAA: "DEAA",
  DOPD: "Douglas PUD",
  DUK: "DUK",
  EPE: "EPE",
  ERCO: "ERCOT",
  FMPP: "FMPP",
  FPC: "DEF",
  FPL: "FPL",
  GCPD: "Grant PUD",
  GLHB: "GridLiance",
  GRIF: "Griffith",
  GRIS: "Gridforce",
  GVL: "GRU",
  GWA: "NaturEner",
  HECO: "HECO",
  HGMA: "HGMA",
  HST: "Homestead",
  IID: "IID",
  IPCO: "Idaho Power",
  ISNE: "ISO-NE",
  JEA: "JEA",
  LDWP: "LADWP",
  LGEE: "LG&E/KU",
  MISO: "MISO",
  NBSO: "NBSO",
  NEVP: "NV Energy",
  NWMT: "NorthWestern",
  NYIS: "NYISO",
  PACE: "PacifiCorp East",
  PACW: "PacifiCorp West",
  PGE: "PGE",
  PJM: "PJM",
  PNM: "PNM",
  PSCO: "Xcel CO",
  PSEI: "PSE",
  SC: "Santee Cooper",
  SCEG: "Dominion SC",
  SCL: "Seattle City Light",
  SEC: "Seminole",
  SEPA: "SEPA",
  SOCO: "Southern",
  SPA: "SWPA",
  SRP: "SRP",
  SWPP: "SPP",
  TAL: "Tallahassee",
  TEC: "TECO",
  TEPC: "TEP",
  TIDC: "TID",
  TPWR: "Tacoma Power",
  TVA: "TVA",
  WACM: "WAPA RM",
  WALC: "WAPA DSW",
  WAUW: "WAPA UGP",
  WWA: "NaturEner WW",
  YAD: "Yadkin",
  AVRN: "Avangrid",
};

// Display names (cleaned up from EIA names)
const BA_DISPLAY_NAMES: Record<string, string> = {
  CISO: "California Independent System Operator",
  ERCO: "Electric Reliability Council of Texas",
  ISNE: "ISO New England",
  MISO: "Midcontinent Independent System Operator",
  NYIS: "New York Independent System Operator",
  PJM: "PJM Interconnection",
  SWPP: "Southwest Power Pool",
  BPAT: "Bonneville Power Administration",
  TVA: "Tennessee Valley Authority",
  SOCO: "Southern Company Services",
  DUK: "Duke Energy Carolinas",
  FPL: "Florida Power & Light",
  FPC: "Duke Energy Florida",
  CPLE: "Duke Energy Progress East",
  CPLW: "Duke Energy Progress West",
  AZPS: "Arizona Public Service",
  SCEG: "Dominion Energy South Carolina",
  LDWP: "Los Angeles Department of Water & Power",
  LGEE: "Louisville Gas & Electric / Kentucky Utilities",
  PSCO: "Public Service Company of Colorado",
  IPCO: "Idaho Power",
  NEVP: "Nevada Power",
  NWMT: "NorthWestern Energy",
  SEPA: "Southeastern Power Administration",
  SPA: "Southwestern Power Administration",
  WACM: "Western Area Power Administration — Rocky Mountain",
  WALC: "Western Area Power Administration — Desert Southwest",
  WAUW: "Western Area Power Administration — Upper Great Plains",
  PACE: "PacifiCorp East",
  PACW: "PacifiCorp West",
  AECI: "Associated Electric Cooperative",
  PSEI: "Puget Sound Energy",
  PNM: "Public Service Company of New Mexico",
  SC: "South Carolina Public Service Authority",
  HECO: "Hawaiian Electric",
  CHPD: "Chelan County PUD",
  GCPD: "Grant County PUD",
  DOPD: "Douglas County PUD",
  BANC: "Balancing Authority of Northern California",
  FMPP: "Florida Municipal Power Pool",
  TPWR: "Tacoma Power",
  NBSO: "New Brunswick System Operator",
};

function baSlugify(name: string): string {
  return slugify(name, { normalizeEmDashes: true, stripParentheticals: true });
}

async function fetchHifldFeatures(): Promise<Feature<Geometry, HifldProperties>[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "OBJECTID_1,ID,NAME,STATE,WEBSITE,TOTAL_CAP,PEAK_LOAD",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "100",
  });

  console.log("  Fetching BA boundaries from HIFLD Control Areas...");
  const response = await fetch(`${HIFLD_CONTROL_AREAS_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`HIFLD request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeatureCollection<Geometry, HifldProperties>;
  return data.features ?? [];
}

function loadEiaBAs(): Map<string, EiaBa> {
  const filePath = path.join(EIA_DATA_DIR, "Balancing_Authority_2024.xlsx");
  if (!fs.existsSync(filePath)) {
    console.warn("  Warning: EIA Balancing_Authority_2024.xlsx not found, skipping EIA data");
    return new Map();
  }

  const wb = XLSX.readFile(filePath);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Balancing Authority"], { header: 1 });

  const bas = new Map<string, EiaBa>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row[1]) continue;
    const eiaId = String(row[1]);
    const code = String(row[2]);
    const state = String(row[3]);
    const name = String(row[4]);
    if (!code || code === "undefined") continue;

    if (!bas.has(code)) {
      bas.set(code, { eiaId, code, name, states: [] });
    }
    const ba = bas.get(code)!;
    if (state && state !== "undefined" && !ba.states.includes(state)) {
      ba.states.push(state);
    }
  }

  return bas;
}

// EIA registers many individual utilities/generators as "balancing authorities".
// We only keep the structural BAs that actually coordinate multiple utilities
// as grid control areas. The rest are already in utilities.json as utilities.
const STRUCTURAL_BA_CODES = new Set([
  "AECI",
  "AVA",
  "AZPS",
  "BANC",
  "BPAT", // AECI, Avista, APS, BANC, BPA
  "CISO",
  "CPLE",
  "CPLW",
  "DUK",
  "EPE", // CAISO, DEP East/West, DUK, EPE
  "ERCO",
  "FMPP",
  "FPC",
  "FPL", // ERCOT, FMPP, DEF, FPL
  "HECO",
  "IID",
  "IPCO",
  "ISNE", // HECO, IID, Idaho Power, ISO-NE
  "LDWP",
  "LGEE",
  "MISO",
  "NBSO",
  "NEVP", // LADWP, LG&E/KU, MISO, NBSO, NV Energy
  "NWMT",
  "NYIS",
  "PACE",
  "PACW",
  "PGE", // NorthWestern, NYISO, PacifiCorp E/W, PGE
  "PJM",
  "PNM",
  "PSCO",
  "PSEI", // PJM, PNM, Xcel CO, PSE
  "SC",
  "SCEG",
  "SEC",
  "SEPA",
  "SOCO", // Santee Cooper, Dominion SC, Seminole, SEPA, Southern
  "SPA",
  "SRP",
  "SWPP",
  "TEPC",
  "TVA", // SWPA, SRP, SPP, TEP, TVA
  "WACM",
  "WALC",
  "WAUW", // WAPA RM/DSW/UGP
]);

// HIFLD uses older/different EIA IDs for some BAs
const HIFLD_ID_TO_EIA_CODE: Record<string, string> = {
  "16534": "BANC", // HIFLD uses old SMUD ID, EIA uses 65289
  "14610": "FMPP", // HIFLD uses old OUC ID, EIA uses 65277
  "55372": "HGMA", // HIFLD uses different ID than EIA 32790
  "189": "PWRN", // PowerSouth — not in EIA-861 2024 as a BA
};

function buildHifldToCodeMap(eiaBAs: Map<string, EiaBa>): Map<string, string> {
  const idToCode = new Map<string, string>();
  for (const [code, ba] of eiaBAs) {
    idToCode.set(ba.eiaId, code);
  }
  // Add explicit overrides for mismatched IDs
  for (const [hifldId, code] of Object.entries(HIFLD_ID_TO_EIA_CODE)) {
    if (eiaBAs.has(code)) {
      idToCode.set(hifldId, code);
    }
  }
  return idToCode;
}

async function main() {
  console.log("Syncing Balancing Authority data\n");

  fs.mkdirSync(TERRITORIES_DIR, { recursive: true });
  const today = new Date().toISOString().split("T")[0];

  // ── 1. Load EIA BA data ────────────────────────────────────────────
  console.log("1. Loading EIA-861 Balancing Authority data...");
  const eiaBAs = loadEiaBAs();
  console.log(`  Found ${eiaBAs.size} BAs in EIA data\n`);

  // ── 2. Fetch HIFLD boundaries ──────────────────────────────────────
  console.log("2. Fetching HIFLD Control Area boundaries...");
  const hifldFeatures = await fetchHifldFeatures();
  console.log(`  Fetched ${hifldFeatures.length} BA territories\n`);

  // ── 3. Load existing data ──────────────────────────────────────────
  const isos: IsoRecord[] = readJSON("isos.json");
  const isoBySlug = new Map(isos.map((i) => [i.slug, i]));

  const utilities: UtilityRecord[] = readJSON("utilities.json");
  const regions: RegionRecord[] = readJSON("regions.json");

  // Remove existing BA regions (idempotent)
  const filteredRegions = regions.filter((r) => r.type !== "BALANCING_AUTHORITY");

  // ── 4. Build ID→Code mapping ───────────────────────────────────────
  const hifldIdToCode = buildHifldToCodeMap(eiaBAs);

  // ── 5. Process all BAs (EIA as primary, HIFLD for geometry) ────────
  console.log("3. Building BA records...");
  const newBAs: BaRecord[] = [];
  const newRegions: RegionRecord[] = [];
  const baByCode = new Map<string, BaRecord>();
  let geoWritten = 0;

  // First, create records for structural EIA BAs only
  let skippedCount = 0;
  for (const [code, eiaBa] of eiaBAs) {
    if (!STRUCTURAL_BA_CODES.has(code)) {
      skippedCount++;
      continue;
    }
    const displayName = BA_DISPLAY_NAMES[code] ?? eiaBa.name;
    const shortName = BA_SHORT_NAMES[code] ?? code;
    const slug = baSlugify(shortName.length > 3 ? shortName : displayName);
    const baId = `ba-${slug}`;
    const regionId = `region-ba-${slug}`;

    const isoSlug = BA_TO_ISO[code];
    const iso = isoSlug ? isoBySlug.get(isoSlug) : null;

    const ba: BaRecord = {
      id: baId,
      slug,
      name: displayName,
      shortName,
      eiaCode: code,
      eiaId: eiaBa.eiaId,
      website: null,
      states: eiaBa.states.sort(),
      isoId: iso?.id ?? null,
      regionId,
    };

    newBAs.push(ba);
    baByCode.set(code, ba);
  }

  console.log(`  Created ${newBAs.length} structural BA records (skipped ${skippedCount} utility-level BAs)\n`);

  // Match HIFLD features to BAs and write GeoJSON
  for (const feature of hifldFeatures) {
    const props = feature.properties;
    if (!props?.ID) continue;

    const hifldId = props.ID;
    const code = hifldIdToCode.get(hifldId);

    if (!code) continue;

    const ba = baByCode.get(code);
    if (!ba) continue;

    // Update website from HIFLD if we don't have one
    if (props.WEBSITE && props.WEBSITE !== "NOT AVAILABLE" && !ba.website) {
      let url = props.WEBSITE.trim();
      if (!url.startsWith("http")) url = `https://${url}`;
      // Clean up obviously broken URLs
      if (!url.includes("webcache.googleusercontent.com")) {
        ba.website = url;
      }
    }

    // Write territory GeoJSON
    const geoJson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            id: ba.regionId,
            name: ba.name,
            code: ba.eiaCode,
          },
          geometry: feature.geometry,
        },
      ],
    };

    writeTerritory(`ba-${ba.slug}.json`, geoJson);
    geoWritten++;

    // Create region record
    newRegions.push({
      id: ba.regionId!,
      slug: `ba-${ba.slug}`,
      name: ba.name,
      type: "BALANCING_AUTHORITY",
      eiaId: ba.eiaId,
      state: null,
      customers: null,
      source: "HIFLD Control Areas",
      sourceDate: today,
    });
  }

  // Clean up stale BA territory files (from BAs we no longer keep)
  const validBaSlugs = new Set(newBAs.map((ba) => `ba-${ba.slug}.json`));
  const existingFiles = fs.readdirSync(TERRITORIES_DIR).filter((f) => f.startsWith("ba-") && f.endsWith(".json"));
  let cleaned = 0;
  for (const file of existingFiles) {
    if (!validBaSlugs.has(file)) {
      fs.unlinkSync(path.join(TERRITORIES_DIR, file));
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`  Removed ${cleaned} stale BA territory files`);
  }

  // Sort BAs by name
  newBAs.sort((a, b) => a.name.localeCompare(b.name));

  // ── 6. Link utilities to BAs ───────────────────────────────────────
  console.log("\n4. Linking utilities to BAs...");
  const baByEiaCode = new Map(newBAs.map((ba) => [ba.eiaCode, ba]));
  let linked = 0;
  for (const utility of utilities) {
    if (!utility.baCode) continue;
    const ba = baByEiaCode.get(utility.baCode);
    if (ba) {
      utility.balancingAuthorityId = ba.id;
      linked++;
    }
  }
  console.log(`  Linked ${linked} utilities to BAs\n`);

  // ── 7. Write all data ──────────────────────────────────────────────
  writeJSON("balancing-authorities.json", newBAs);

  const allRegions = [...filteredRegions, ...newRegions];
  allRegions.sort((a, b) => a.name.localeCompare(b.name));
  writeJSON("regions.json", allRegions);

  writeJSON("utilities.json", utilities);

  // ── Summary ────────────────────────────────────────────────────────
  const withGeo = newBAs.filter((ba) => newRegions.some((r) => r.id === ba.regionId)).length;
  const withWebsite = newBAs.filter((ba) => ba.website).length;
  const withIso = newBAs.filter((ba) => ba.isoId).length;

  console.log("\nSync complete:");
  console.log(`  Total BAs: ${newBAs.length}`);
  console.log(`  With territory GeoJSON: ${withGeo}`);
  console.log(`  With website: ${withWebsite}`);
  console.log(`  With ISO linkage: ${withIso}`);
  console.log(`  Territory files written: ${geoWritten}`);
  console.log(`  Utilities linked: ${linked}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
