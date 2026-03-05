/**
 * Enrich script: Add missing utilities from EIA-861 data and mark stale entries.
 *
 * This script reads the pre-analyzed EIA-861 data (eia-analysis-output.json)
 * and applies changes directly to utilities.json:
 *
 * 1. Adds missing CCAs (Community Choice Aggregators)
 * 2. Adds missing transmission-only entities
 * 3. Adds missing IOU subsidiaries
 * 4. Marks stale/merged/defunct entries with appropriate status
 *
 * Usage:
 *   cd apps/commongrid
 *   yarn enrich:eia
 */

import * as crypto from "node:crypto";
import { isValidStateCode } from "@texturehq/geography-config";
import { readJSON, slugify, writeJSON } from "./lib";

interface Utility {
  id: string;
  slug: string;
  name: string;
  eiaName: string | null;
  shortName: string | null;
  logo: string | null;
  website: string | null;
  eiaId: string | null;
  segment: string;
  status: string;
  customerCount: number | null;
  peakDemandMw: number | null;
  jurisdiction: string | null;
  isoId: string | null;
  rtoId: string | null;
  balancingAuthorityId: string | null;
  generationProviderId: string | null;
  transmissionProviderId: string | null;
  parentId: string | null;
  successorId: string | null;
  serviceTerritoryId: string | null;
  notionPageId: string | null;
}

interface EiaEntity {
  eiaId: number;
  name: string;
  ownershipCode: string;
  ownership: string;
  states: string[];
  customerCount: number;
  totalSalesMwh: number;
  totalRevenueThousands: number;
}

interface StaleEntity {
  id: string;
  eiaId: string;
  name: string;
  segment: string;
  status: string;
  customerCount: number | null;
}

interface AnalysisData {
  missingEntities: {
    cca: { entities: EiaEntity[] };
    transmission: { entities: EiaEntity[] };
    iou: { entities: EiaEntity[] };
  };
  staleEntries: { entities: StaleEntity[] };
}

// Known merger mappings: old EIA ID → successor EIA ID
const MERGER_SUCCESSOR_MAP: Record<string, string> = {
  "20387": "66101", // West Penn Power → FirstEnergy Pennsylvania Electric Co
  "14711": "66101", // Pennsylvania Electric → FirstEnergy Pennsylvania Electric Co
  "12390": "66101", // Metropolitan Edison → FirstEnergy Pennsylvania Electric Co
  "7801": "6452", // Gulf Power → Florida Power & Light (NextEra)
  "55936": "11241", // Entergy Gulf States - La → Entergy Louisiana
  "20455": "54913", // Western Massachusetts Electric → NSTAR Electric (Eversource)
  "14716": "66101", // Pennsylvania Power → FirstEnergy Pennsylvania Electric Co
};

const LEGAL_SUFFIXES = [
  ", Incorporated",
  ", Inc.",
  ", Inc",
  " Corporation",
  " Corp.",
  " Company",
  " Co, Inc",
  ", LLC",
  " LLC",
  " plc",
  " Ltd.",
];

function formatName(name: string): string {
  let result = name.trim();

  // Strip trailing comma artifacts from truncation
  if (result.endsWith(",")) {
    result = result.slice(0, -1);
  }

  // Strip legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    if (result.toLowerCase().endsWith(suffix.toLowerCase())) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }

  // Strip trailing periods
  if (result.endsWith(".")) {
    result = result.slice(0, -1);
  }

  return result.trim();
}

function generateId(): string {
  return crypto.randomUUID();
}

function formatJurisdiction(states: string[]): string | null {
  const valid = states.filter((s) => isValidStateCode(s));
  return valid.length > 0 ? valid.sort().join(", ") : null;
}

function createUtility(entity: EiaEntity, segment: string): Utility {
  const name = formatName(entity.name);
  const eiaId = String(entity.eiaId);

  return {
    id: generateId(),
    slug: slugify(name),
    name,
    eiaName: entity.name,
    shortName: null,
    logo: null,
    website: null,
    eiaId,
    segment,
    status: "ACTIVE",
    customerCount: entity.customerCount > 0 ? entity.customerCount : null,
    peakDemandMw: null,
    jurisdiction: formatJurisdiction(entity.states),
    isoId: null,
    rtoId: null,
    balancingAuthorityId: null,
    generationProviderId: null,
    transmissionProviderId: null,
    parentId: null,
    successorId: null,
    serviceTerritoryId: null,
    notionPageId: null,
  };
}

function main() {
  console.log("Enriching utilities.json from EIA-861 analysis\n");

  const utilities: Utility[] = readJSON("utilities.json");
  const analysis: AnalysisData = readJSON("eia-analysis-output.json");
  const existingEiaIds = new Set(utilities.filter((u) => u.eiaId).map((u) => u.eiaId));
  const existingSlugs = new Set(utilities.map((u) => u.slug));

  let added = 0;
  let markedMerged = 0;
  let markedDefunct = 0;
  let removedTest = 0;

  // Helper to ensure unique slugs
  function ensureUniqueSlug(slug: string, eiaId: string): string {
    if (!existingSlugs.has(slug)) {
      existingSlugs.add(slug);
      return slug;
    }
    const uniqueSlug = `${slug}-${eiaId}`;
    existingSlugs.add(uniqueSlug);
    return uniqueSlug;
  }

  // ── 1. Add missing CCAs ─────────────────────────────────────────────
  console.log("1. Adding missing CCAs...");
  for (const entity of analysis.missingEntities.cca.entities) {
    const eiaId = String(entity.eiaId);
    if (existingEiaIds.has(eiaId)) continue;

    const utility = createUtility(entity, "COMMUNITY_CHOICE_AGGREGATOR");
    utility.slug = ensureUniqueSlug(utility.slug, eiaId);
    utilities.push(utility);
    existingEiaIds.add(eiaId);
    added++;
    console.log(`  + ${utility.name} (EIA ${eiaId}, ${entity.customerCount.toLocaleString()} customers)`);
  }

  // ── 2. Add missing transmission entities ────────────────────────────
  console.log("\n2. Adding missing transmission entities...");
  for (const entity of analysis.missingEntities.transmission.entities) {
    const eiaId = String(entity.eiaId);
    if (existingEiaIds.has(eiaId)) continue;

    const utility = createUtility(entity, "TRANSMISSION_OPERATOR");
    utility.slug = ensureUniqueSlug(utility.slug, eiaId);
    utilities.push(utility);
    existingEiaIds.add(eiaId);
    added++;
    console.log(`  + ${utility.name} (EIA ${eiaId})`);
  }

  // ── 3. Add missing IOU subsidiaries ─────────────────────────────────
  console.log("\n3. Adding missing IOU subsidiaries...");
  for (const entity of analysis.missingEntities.iou.entities) {
    const eiaId = String(entity.eiaId);
    if (existingEiaIds.has(eiaId)) continue;

    const utility = createUtility(entity, "INVESTOR_OWNED_UTILITY");
    utility.slug = ensureUniqueSlug(utility.slug, eiaId);
    utilities.push(utility);
    existingEiaIds.add(eiaId);
    added++;
    const custStr = entity.customerCount > 0 ? `, ${entity.customerCount.toLocaleString()} customers` : "";
    console.log(`  + ${utility.name} (EIA ${eiaId}${custStr})`);
  }

  // ── 4. Mark stale/merged/defunct entries ─────────────────────────────
  console.log("\n4. Marking stale entries...");
  const utilityByEiaId = new Map(utilities.filter((u) => u.eiaId).map((u) => [u.eiaId!, u]));

  for (const stale of analysis.staleEntries.entities) {
    const utility = utilities.find((u) => u.id === stale.id);
    if (!utility) continue;

    // Skip Canadian utilities — they're valid, just not in the US EIA dataset
    if (stale.eiaId.startsWith("NA")) continue;

    // Remove test data
    if (stale.eiaId === "99999") {
      const idx = utilities.indexOf(utility);
      if (idx >= 0) {
        utilities.splice(idx, 1);
        removedTest++;
        console.log(`  ✕ Removed test utility (EIA 99999)`);
      }
      continue;
    }

    // Check if this is a known merger
    const successorEiaId = MERGER_SUCCESSOR_MAP[stale.eiaId];
    if (successorEiaId) {
      const successor = utilityByEiaId.get(successorEiaId);
      utility.status = "MERGED";
      if (successor) {
        utility.successorId = successor.id;
      }
      markedMerged++;
      const successorName = successor?.name ?? `EIA ${successorEiaId}`;
      console.log(`  → ${utility.name} (EIA ${stale.eiaId}) → MERGED into ${successorName}`);
      continue;
    }

    // All other stale entries: mark as defunct
    utility.status = "DEFUNCT";
    markedDefunct++;
    console.log(`  ⊘ ${utility.name} (EIA ${stale.eiaId}) → DEFUNCT`);
  }

  // ── 5. Sort and write ───────────────────────────────────────────────
  utilities.sort((a, b) => {
    // Sort by customer count descending (nulls last), then name
    const aCount = a.customerCount ?? -1;
    const bCount = b.customerCount ?? -1;
    if (aCount !== bCount) return bCount - aCount;
    return a.name.localeCompare(b.name);
  });

  writeJSON("utilities.json", utilities);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log("\nEnrichment complete:");
  console.log(`  Added: ${added} utilities`);
  console.log(`  Merged: ${markedMerged} utilities`);
  console.log(`  Defunct: ${markedDefunct} utilities`);
  console.log(`  Removed: ${removedTest} test entries`);
  console.log(`  Total: ${utilities.length} utilities`);
}

main();
