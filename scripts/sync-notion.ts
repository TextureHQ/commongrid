/**
 * Sync script: Pull utilities and ISOs data from Notion Knowledge Base
 * and write static JSON files for the commongrid app.
 *
 * Usage:
 *   cd apps/commongrid
 *   export $(cat ../../packages/notion-client/.env | xargs) && yarn sync:notion
 */

import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { isValidStateCode } from "@texturehq/geography-config";
import { slugify, writeJSON } from "./lib";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error("NOTION_TOKEN environment variable is required.");
  console.error("Run: export $(cat ../../packages/notion-client/.env | xargs) && yarn tsx scripts/sync-notion-data.ts");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const DATABASE_IDS = {
  UTILITIES: "7afaeaf4-413e-4171-94c7-88d37b5cd632",
  ISOS: "e5c6b0dd-1a6c-4ae1-86a9-506e09e789e4",
  STATES: "2de60936-baed-4625-ba8d-507489e375fd",
};

// Map Notion Market Segments page IDs to PRD UtilitySegment enum values
const SEGMENT_PAGE_ID_TO_ENUM: Record<string, string> = {
  "2d75b7fc-9f3d-8134-9ccb-f5caffcf4b68": "INVESTOR_OWNED_UTILITY",
  "2d95b7fc-9f3d-8080-b1b4-e264fd8858e9": "INVESTOR_OWNED_UTILITY", // IOU Parent Companies → same enum
  "2d75b7fc-9f3d-81ab-9e00-c0f28bf0ffb9": "DISTRIBUTION_COOPERATIVE",
  "2d95b7fc-9f3d-80d0-ae3f-d1acb8d45d01": "GENERATION_AND_TRANSMISSION",
  "2d95b7fc-9f3d-80bb-8aea-e09c874e9fca": "MUNICIPAL_UTILITY",
  "2d95b7fc-9f3d-8163-9f27-c8fff968e84f": "POLITICAL_SUBDIVISION",
};

const KNOWN_ABBREVIATIONS = new Set(["Co.", "Inc.", "No.", "St.", "Dist.", "Conserv.", "Assn."]);

const LEGAL_SUFFIXES = [", Incorporated", ", Inc.", ", Inc", " Corporation", " Corp.", " Company", " plc", " Ltd."];

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

function formatUtilityName(name: string): string {
  let result = name.trim();

  // 1. Strip legal suffixes from end of string (before trailing period removal)
  for (const suffix of LEGAL_SUFFIXES) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }

  // 2. Strip trailing periods — unless preceded by a known abbreviation
  if (result.endsWith(".")) {
    const endsWithKnownAbbr = [...KNOWN_ABBREVIATIONS].some((abbr) => result.endsWith(abbr));
    if (!endsWithKnownAbbr) {
      result = result.slice(0, -1);
    }
  }

  // 3. Uppercase parenthetical state codes — (tx) → (TX)
  result = result.replace(/\(([a-z]{2})\)/g, (_match, code: string) => {
    const upper = code.toUpperCase();
    if (US_STATE_CODES.has(upper)) {
      return `(${upper})`;
    }
    return `(${code})`;
  });

  // 4. Uppercase Co-XX state codes (but not Co-op)
  result = result.replace(/Co-([a-z]{2})(?=\s|$)/g, (_match, code: string) => {
    const upper = code.toUpperCase();
    if (upper === "OP") return `Co-${code}`;
    if (US_STATE_CODES.has(upper)) {
      return `Co-${upper}`;
    }
    return `Co-${code}`;
  });

  // 5. Title case after hyphens (skip already-uppercased Co-XX)
  result = result.replace(/-([a-z])/g, (match, letter, offset) => {
    const before = result.slice(0, offset + 1);
    if (before.endsWith("Co-") && letter === "o") {
      const after = result.slice(offset + 2);
      if (after.startsWith("p") || after.startsWith("p ") || after.startsWith("p.") || after === "p") {
        return match;
      }
    }
    return `-${(letter as string).toUpperCase()}`;
  });

  // 6. Normalize "Co-op" to "Cooperative"
  result = result.replace(/\bCo-op\b/g, "Cooperative");

  // 7. Normalize "E M C" to "EMC"
  result = result.replace(/\bE M C\b/g, "EMC");

  return result;
}

function deduplicateSlugs<T extends { slug: string; jurisdiction?: string | null }>(items: T[]): T[] {
  // First pass: append jurisdiction to disambiguate
  const slugCounts = new Map<string, number>();
  for (const item of items) {
    slugCounts.set(item.slug, (slugCounts.get(item.slug) ?? 0) + 1);
  }

  const result = items.map((item) => {
    const count = slugCounts.get(item.slug) ?? 1;
    if (count <= 1) return item;

    const jurisdiction = item.jurisdiction;
    if (jurisdiction) {
      return { ...item, slug: `${item.slug}-${slugify(jurisdiction)}` };
    }
    return item;
  });

  // Second pass: append index for any remaining duplicates
  const finalCounts = new Map<string, number>();
  for (const item of result) {
    finalCounts.set(item.slug, (finalCounts.get(item.slug) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return result.map((item) => {
    const count = finalCounts.get(item.slug) ?? 1;
    if (count <= 1) return item;

    const idx = (seen.get(item.slug) ?? 0) + 1;
    seen.set(item.slug, idx);
    return { ...item, slug: `${item.slug}-${idx}` };
  });
}

function getPropertyValue(page: PageObjectResponse, propertyName: string): unknown {
  const property = page.properties[propertyName];
  if (!property) return undefined;

  switch (property.type) {
    case "title":
      return property.title[0]?.plain_text;
    case "rich_text":
      return property.rich_text[0]?.plain_text;
    case "number":
      return property.number;
    case "select":
      return property.select?.name;
    case "multi_select":
      return property.multi_select.map((s) => s.name);
    case "url":
      return property.url;
    case "files":
      if (property.files.length > 0) {
        const file = property.files[0];
        if (file.type === "external") return file.external.url;
        if (file.type === "file") return file.file.url;
      }
      return null;
    case "relation":
      return property.relation.map((r) => r.id);
    case "rollup":
      if (property.rollup.type === "array") {
        return property.rollup.array.flatMap((item) => {
          if (item.type === "relation") {
            return item.relation.map((r) => r.id);
          }
          if (item.type === "title") {
            return item.title.map((t) => t.plain_text);
          }
          if (item.type === "rich_text") {
            return item.rich_text.map((t) => t.plain_text);
          }
          return [];
        });
      }
      return undefined;
    default:
      return undefined;
  }
}

async function queryAllPages(databaseId: string): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    });

    for (const page of response.results) {
      if ("properties" in page) {
        pages.push(page as PageObjectResponse);
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

async function buildStateLookup(): Promise<Map<string, string>> {
  console.log("Fetching States from Notion...");
  const pages = await queryAllPages(DATABASE_IDS.STATES);
  console.log(`  Found ${pages.length} states`);

  const lookup = new Map<string, string>();
  for (const page of pages) {
    const abbr = (getPropertyValue(page, "Abbreviation") as string) ?? (getPropertyValue(page, "Name") as string) ?? "";
    if (abbr) {
      lookup.set(page.id, abbr);
    }
  }
  return lookup;
}

// Matches PRD Iso interface (no description)
interface IsoRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  states: string[];
  website: string | null;
}

async function syncIsos(): Promise<IsoRecord[]> {
  console.log("Fetching ISOs from Notion...");
  const pages = await queryAllPages(DATABASE_IDS.ISOS);
  console.log(`  Found ${pages.length} ISOs`);

  const isos: IsoRecord[] = pages
    .map((page) => {
      const name = (getPropertyValue(page, "Name") as string) ?? "";
      const abbreviation = (getPropertyValue(page, "Abbreviation") as string) ?? "";
      const states = (getPropertyValue(page, "State") as string[]) ?? [];
      const website = (getPropertyValue(page, "Website") as string) ?? null;

      return {
        id: page.id,
        slug: slugify(abbreviation || name),
        name,
        shortName: abbreviation,
        states: states.sort(),
        website,
      };
    })
    .filter((iso) => iso.name)
    .sort((a, b) => a.shortName.localeCompare(b.shortName));

  return isos;
}

// Matches PRD Utility interface
interface UtilityRecord {
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

async function syncUtilities(
  isoLookup: Map<string, IsoRecord>,
  stateLookup: Map<string, string>
): Promise<UtilityRecord[]> {
  console.log("Fetching utilities from Notion...");
  const pages = await queryAllPages(DATABASE_IDS.UTILITIES);
  console.log(`  Found ${pages.length} utilities`);

  const utilities: UtilityRecord[] = pages
    .map((page) => {
      const rawName = (getPropertyValue(page, "Name") as string) ?? "";
      const name = rawName ? formatUtilityName(rawName) : "";
      const segmentIds = (getPropertyValue(page, "Segment") as string[]) ?? [];
      const stateIds = (getPropertyValue(page, "States") as string[]) ?? [];
      const customers = (getPropertyValue(page, "Customers") as number) ?? null;
      const website = (getPropertyValue(page, "Website") as string) ?? null;
      const logo = (getPropertyValue(page, "Logo") as string) ?? null;
      const eiaId = (getPropertyValue(page, "EIA ID") as string) ?? null;
      const gtIds = (getPropertyValue(page, "G&T") as string[]) ?? [];
      const parentIds = (getPropertyValue(page, "Parent Utility") as string[]) ?? [];

      // Resolve state IDs to abbreviations and validate
      const stateAbbrs = stateIds
        .map((id) => stateLookup.get(id))
        .filter((s): s is string => !!s)
        .filter((s) => {
          if (!isValidStateCode(s)) {
            console.warn(`  Warning: Invalid state code "${s}" for utility "${rawName}"`);
            return false;
          }
          return true;
        })
        .sort();
      const jurisdiction = stateAbbrs.length > 0 ? stateAbbrs.join(", ") : null;

      // ISO is a rollup — try to resolve it
      const isoRollup = getPropertyValue(page, "ISO");
      let isoId: string | null = null;
      if (Array.isArray(isoRollup) && isoRollup.length > 0) {
        const firstIso = isoRollup[0];
        if (typeof firstIso === "string") {
          if (firstIso.includes("-") && firstIso.length > 30) {
            isoId = firstIso;
          } else {
            for (const [id, iso] of isoLookup) {
              if (iso.shortName === firstIso || iso.name === firstIso) {
                isoId = id;
                break;
              }
            }
          }
        }
      }

      // Map segment page ID to PRD UtilitySegment enum
      let segment = "INVESTOR_OWNED_UTILITY";
      if (segmentIds.length > 0) {
        segment = SEGMENT_PAGE_ID_TO_ENUM[segmentIds[0]] ?? "INVESTOR_OWNED_UTILITY";
      }

      return {
        id: page.id,
        slug: slugify(rawName),
        name,
        eiaName: null, // Not available in Notion yet
        shortName: null, // Not available in Notion yet
        logo,
        website,
        eiaId: eiaId || null,
        segment,
        status: "ACTIVE",
        customerCount: customers,
        peakDemandMw: null, // Not available in Notion yet
        jurisdiction,
        isoId,
        rtoId: isoId, // In the US, ISOs also function as RTOs
        balancingAuthorityId: null,
        generationProviderId: gtIds.length > 0 ? gtIds[0] : null,
        transmissionProviderId: gtIds.length > 0 ? gtIds[0] : null, // Default to G&T provider
        parentId: parentIds.length > 0 ? parentIds[0] : null,
        successorId: null,
        serviceTerritoryId: null, // Not available in Notion yet
        notionPageId: page.id,
      };
    })
    .filter((u) => u.name)
    .sort((a, b) => (b.customerCount ?? 0) - (a.customerCount ?? 0));

  return deduplicateSlugs(utilities);
}

async function main() {
  console.log("Syncing Notion Knowledge Base -> commongrid data\n");

  // Build state lookup first
  const stateLookup = await buildStateLookup();

  // Sync ISOs (needed for utility ISO resolution)
  const isos = await syncIsos();
  const isoLookup = new Map(isos.map((iso) => [iso.id, iso]));

  // Sync utilities
  const utilities = await syncUtilities(isoLookup, stateLookup);

  // RTOs: In the US energy grid, RTOs and ISOs are essentially the same entities.
  // All 7 US ISOs also function as RTOs. We use the same data.
  const rtos = isos.map((iso) => ({ ...iso }));

  // Write data files
  console.log("\nWriting data files...");
  writeJSON("isos.json", isos);
  writeJSON("rtos.json", rtos);
  writeJSON("utilities.json", utilities);

  // Summary
  console.log("\nSync complete:");
  console.log(`  ISOs: ${isos.length}`);
  console.log(`  RTOs: ${rtos.length}`);
  console.log(`  Utilities: ${utilities.length}`);

  const segmentCounts: Record<string, number> = {};
  for (const u of utilities) {
    segmentCounts[u.segment] = (segmentCounts[u.segment] ?? 0) + 1;
  }
  console.log("\n  Utilities by segment:");
  for (const [seg, count] of Object.entries(segmentCounts).sort()) {
    console.log(`    ${seg}: ${count}`);
  }

  // Check for remaining duplicate slugs
  const slugs = utilities.map((u) => u.slug);
  const dupes = [...new Set(slugs.filter((s, i) => slugs.indexOf(s) !== i))];
  if (dupes.length > 0) {
    console.warn(`\n  WARNING: ${dupes.length} duplicate slugs remain`);
    for (const s of dupes.slice(0, 5)) {
      const names = utilities.filter((u) => u.slug === s).map((u) => u.name);
      console.warn(`    ${s}: ${names.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
