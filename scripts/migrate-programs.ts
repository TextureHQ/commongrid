/**
 * migrate-programs.ts
 *
 * Pulls all programs from the Notion Programs DB and migrates them to
 * OpenGrid's Program schema, writing the output to data/programs.json.
 *
 * Usage:
 *   source ~/.zshrc && npx ts-node scripts/migrate-programs.ts
 *   or:
 *   NOTION_API_KEY=<key> npx ts-node scripts/migrate-programs.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("❌ NOTION_API_KEY environment variable is required.");
  process.exit(1);
}

const NOTION_VERSION = "2022-06-28"; // stable version supported by the API
const PROGRAMS_DB_ID = "23d15009-f5ed-4bef-82ac-e955e350e7ca";
const DATA_DIR = path.resolve(__dirname, "../data");

// ─── Types ───────────────────────────────────────────────────────────────────

interface UtilityRecord {
  id: string;
  slug: string;
  notionPageId: string;
  jurisdiction: string;
  [key: string]: unknown;
}

interface ProgramOrganization {
  entityId: string;
  role: string;
}

interface CompensationTier {
  tier: number;
  type: string;
  amount: number;
  unit: string;
}

interface Program {
  id: string;
  slug: string;
  name: string;
  description?: string;
  organizations: ProgramOrganization[];
  assetTypes: string[];
  marketSegments: string[];
  participationModels: string[];
  incentiveStructures: string[];
  gridServices: string[];
  regions: string[];
  compensationTiers: CompensationTier[];
  status: string;
  programWebsite?: string;
  variants: never[];
  createdAt: string;
  updatedAt: string;
}

// ─── Mappings ─────────────────────────────────────────────────────────────────

const ASSET_TYPE_MAP: Record<string, string[]> = {
  "Thermostat": ["THERMOSTAT"],
  "EV": ["EV_CHARGER"],
  "Water Heater": ["WATER_HEATER"],
  "Battery": ["BATTERY"],
  "Behavioral": ["NON_DEVICE"],
  "Irrigation": ["IRRIGATION"],
  "C&I": ["COMMERCIAL_LOAD"],
};

const PARTICIPATION_MODEL_MAP: Record<string, string[]> = {
  "Managed Peak Event": ["EVENT_BASED"],
  "Managed Event Dispatch": ["DIRECT_CONTROL"],
};

const COMP_TYPE_MAP: Record<string, string> = {
  "Rebate": "REBATE",
  "Annual": "ANNUAL",
  "Monthly": "MONTHLY",
};

const COMP_UNIT_MAP: Record<string, string> = {
  "per device": "PER_DEVICE",
  "per thermostat": "PER_DEVICE",
  "per kW": "PER_KW",
  "per home": "PER_HOME",
};

const PROGRAM_TYPE_INFERRED: Record<string, {
  marketSegments: string[];
  gridServices: string[];
  incentiveStructures: string[];
}> = {
  "Thermostat": {
    marketSegments: ["RESIDENTIAL"],
    gridServices: ["DEMAND_RESPONSE", "PEAK_SHAVING"],
    incentiveStructures: ["REBATE", "BILL_CREDIT"],
  },
  "EV": {
    marketSegments: ["RESIDENTIAL"],
    gridServices: ["DEMAND_RESPONSE", "LOAD_SHIFTING"],
    incentiveStructures: ["REBATE", "DIRECT_PAYMENT"],
  },
  "Water Heater": {
    marketSegments: ["RESIDENTIAL"],
    gridServices: ["DEMAND_RESPONSE", "LOAD_SHIFTING"],
    incentiveStructures: ["REBATE", "BILL_CREDIT"],
  },
  "Battery": {
    marketSegments: ["RESIDENTIAL"],
    gridServices: ["DEMAND_RESPONSE", "PEAK_SHAVING", "ENERGY_ARBITRAGE"],
    incentiveStructures: ["REBATE", "CAPACITY_PAYMENT"],
  },
  "Behavioral": {
    marketSegments: ["RESIDENTIAL"],
    gridServices: ["DEMAND_RESPONSE", "LOAD_FLEXIBILITY"],
    incentiveStructures: ["BILL_CREDIT"],
  },
  "Irrigation": {
    marketSegments: ["AGRICULTURAL"],
    gridServices: ["DEMAND_RESPONSE", "PEAK_SHAVING"],
    incentiveStructures: ["DIRECT_PAYMENT"],
  },
  "C&I": {
    marketSegments: ["COMMERCIAL", "INDUSTRIAL"],
    gridServices: ["DEMAND_RESPONSE", "DEMAND_CHARGE_REDUCTION"],
    incentiveStructures: ["CAPACITY_PAYMENT"],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getStateFromJurisdiction(jurisdiction: string | null | undefined): string[] {
  if (!jurisdiction) return [];
  // jurisdiction may be "CO", "FL, IN, KY", etc.
  const parts = jurisdiction.split(",").map((s) => s.trim()).filter((s) => s.length === 2);
  return parts.length > 0 ? [parts[0]] : [];
}

// ─── Notion HTTP Client ───────────────────────────────────────────────────────

function notionRequest(method: string, urlPath: string, body?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;

    const options: https.RequestOptions = {
      hostname: "api.notion.com",
      path: urlPath,
      method,
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Notion API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse response: ${raw}`));
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function fetchAllPrograms(): Promise<unknown[]> {
  const results: unknown[] = [];
  let startCursor: string | undefined;
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    page++;
    const body: Record<string, unknown> = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const response = await notionRequest(
      "POST",
      `/v1/databases/${PROGRAMS_DB_ID}/query`,
      body
    ) as { results: unknown[]; has_more: boolean; next_cursor: string | null };

    results.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
    process.stdout.write(`  Page ${page}: fetched ${response.results.length} records (total: ${results.length})\n`);
  }

  return results;
}

// ─── Property Extractors ──────────────────────────────────────────────────────

function getTitle(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; title: Array<{ plain_text: string }> } | undefined;
  if (!p || p.type !== "title") return "";
  return p.title.map((t) => t.plain_text).join("").trim();
}

function getSelect(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as { type: string; select: { name: string } | null } | undefined;
  if (!p || p.type !== "select") return null;
  return p.select?.name ?? null;
}

function getNumber(props: Record<string, unknown>, key: string): number | null {
  const p = props[key] as { type: string; number: number | null } | undefined;
  if (!p || p.type !== "number") return null;
  return p.number;
}

function getUrl(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as { type: string; url: string | null } | undefined;
  if (!p || p.type !== "url") return null;
  return p.url;
}

function getRichText(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as { type: string; rich_text: Array<{ plain_text: string }> } | undefined;
  if (!p || p.type !== "rich_text") return null;
  const text = p.rich_text.map((t) => t.plain_text).join("").trim();
  return text || null;
}

function getRelationId(props: Record<string, unknown>, key: string): string | null {
  const p = props[key] as { type: string; relation: Array<{ id: string }> } | undefined;
  if (!p || p.type !== "relation") return null;
  return p.relation[0]?.id ?? null;
}

// ─── Transform ────────────────────────────────────────────────────────────────

function transformProgram(
  notionPage: unknown,
  utilitiesByNotionId: Map<string, UtilityRecord>
): Program | null {
  const page = notionPage as { id: string; properties: Record<string, unknown> };
  const props = page.properties;

  const name = getTitle(props, "Program Name");
  if (!name) return null; // skip pages without a name

  const programType = getSelect(props, "Program Type");
  const dispatchStrategy = getSelect(props, "Dispatch Strategy");
  const compType1 = getSelect(props, "Compensation Type 1");
  const compAmount1 = getNumber(props, "Compensation Amount 1");
  const compUnit1 = getSelect(props, "Compensation Unit 1");
  const compType2 = getSelect(props, "Compensation Type 2");
  const compAmount2 = getNumber(props, "Compensation Amount 2");
  const compUnit2 = getSelect(props, "Compensation Unit 2");
  const website = getUrl(props, "Program Website");
  const notes = getRichText(props, "Notes");
  const utilityNotionId = getRelationId(props, "Utility");

  // Normalize Notion UUID (may come with or without dashes)
  const normalizedUtilityId = utilityNotionId
    ? utilityNotionId.replace(/-/g, "").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")
    : null;

  const utility = normalizedUtilityId ? utilitiesByNotionId.get(normalizedUtilityId) : undefined;

  // Asset types
  const assetTypes = programType ? (ASSET_TYPE_MAP[programType] ?? []) : [];

  // Participation models
  const participationModels = dispatchStrategy
    ? (PARTICIPATION_MODEL_MAP[dispatchStrategy] ?? ["EVENT_BASED"])
    : ["EVENT_BASED"];

  // Inferred fields
  const inferred = programType ? PROGRAM_TYPE_INFERRED[programType] : undefined;
  const marketSegments = inferred?.marketSegments ?? ["RESIDENTIAL"];
  const gridServices = inferred?.gridServices ?? ["DEMAND_RESPONSE"];
  const incentiveStructures = inferred?.incentiveStructures ?? [];

  // Organizations
  const organizations: ProgramOrganization[] = utility
    ? [{ entityId: utility.slug, role: "ADMINISTRATOR" }]
    : [];

  // Regions
  const regions = utility ? getStateFromJurisdiction(utility.jurisdiction) : [];

  // Compensation tiers
  const compensationTiers: CompensationTier[] = [];
  if (compType1 && COMP_TYPE_MAP[compType1] && compAmount1 != null && compUnit1 && COMP_UNIT_MAP[compUnit1]) {
    compensationTiers.push({
      tier: 1,
      type: COMP_TYPE_MAP[compType1],
      amount: compAmount1,
      unit: COMP_UNIT_MAP[compUnit1],
    });
  }
  if (compType2 && COMP_TYPE_MAP[compType2] && compAmount2 != null && compUnit2 && COMP_UNIT_MAP[compUnit2]) {
    compensationTiers.push({
      tier: 2,
      type: COMP_TYPE_MAP[compType2],
      amount: compAmount2,
      unit: COMP_UNIT_MAP[compUnit2],
    });
  }

  const slug = slugify(name);

  const program: Program = {
    id: `prog-${slug}`,
    slug,
    name,
    organizations,
    assetTypes,
    marketSegments,
    participationModels,
    incentiveStructures,
    gridServices,
    regions,
    compensationTiers,
    status: "ACTIVE",
    variants: [],
    createdAt: "2026-02-21T00:00:00Z",
    updatedAt: "2026-02-21T00:00:00Z",
  };

  if (notes) program.description = notes;
  if (website) program.programWebsite = website;

  return program;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Loading utilities index...");
  const utilitiesPath = path.join(DATA_DIR, "utilities.json");
  const utilitiesRaw: UtilityRecord[] = JSON.parse(fs.readFileSync(utilitiesPath, "utf-8"));

  // Build lookup by notionPageId (normalized, with dashes)
  const utilitiesByNotionId = new Map<string, UtilityRecord>();
  for (const u of utilitiesRaw) {
    if (u.notionPageId) {
      const normalized = u.notionPageId.replace(/-/g, "").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
      utilitiesByNotionId.set(normalized, u);
    }
  }
  console.log(`  Loaded ${utilitiesRaw.length} utilities, ${utilitiesByNotionId.size} with Notion IDs`);

  console.log("\n🔄 Fetching programs from Notion...");
  const notionPages = await fetchAllPrograms();
  console.log(`  ✅ Fetched ${notionPages.length} pages total`);

  console.log("\n🔄 Transforming programs...");
  const programs: Program[] = [];
  let matched = 0;
  let unmatched = 0;
  const unmatchedIds: string[] = [];

  // Deduplicate by slug (keep first occurrence)
  const seenSlugs = new Map<string, number>();

  for (const page of notionPages) {
    const program = transformProgram(page, utilitiesByNotionId);
    if (!program) continue;

    // Handle slug collisions
    if (seenSlugs.has(program.slug)) {
      const count = (seenSlugs.get(program.slug) ?? 1) + 1;
      seenSlugs.set(program.slug, count);
      program.slug = `${program.slug}-${count}`;
      program.id = `prog-${program.slug}`;
    } else {
      seenSlugs.set(program.slug, 1);
    }

    programs.push(program);

    if (program.organizations.length > 0) {
      matched++;
    } else {
      unmatched++;
      const p = (page as { id: string; properties: Record<string, unknown> });
      const utilityId = getRelationId(p.properties, "Utility");
      if (utilityId) unmatchedIds.push(utilityId);
    }
  }

  console.log(`  ✅ Transformed ${programs.length} programs`);
  console.log(`  ✅ Matched utilities: ${matched}`);
  console.log(`  ⚠️  Unmatched utilities: ${unmatched}`);

  if (unmatchedIds.length > 0) {
    console.log(`\n  Unmatched Notion utility IDs (first 20):`);
    for (const id of unmatchedIds.slice(0, 20)) {
      console.log(`    - ${id}`);
    }
  }

  const outputPath = path.join(DATA_DIR, "programs.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(programs, null, 2)}\n`);
  console.log(`\n✅ Wrote ${programs.length} programs to ${outputPath}`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
