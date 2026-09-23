/**
 * Sync script: curated IOU demand-response programs → the Programs registry (CG-289).
 *
 * This is the I/O half of the IOU-DR sync. The pure mapping half lives in
 * lib/sync/iou-dr-programs.ts (ScrapedProgram[] + utility resolver → SyncRecords)
 * and is exhaustively unit-tested. This script:
 *
 *   1. Loads the curated target registry (data/iou-dr-programs/registry.ts) — the
 *      structured facts a human curated from each utility's public program page.
 *      There is no open federal catalog of *named* DR programs (EIA-861 is
 *      aggregate statistics; DSIRE's API is licensed/access-gated), so — exactly
 *      as the distribution-co-op programs already in the model were captured —
 *      the facts come from the utilities' own public pages, curated into the
 *      registry. Extraction is deterministic (registry-driven), not an LLM:
 *      there is no AI SDK in this repo.
 *   2. Builds the resolver input from data/utilities.json.
 *   3. Optionally verifies each program URL is live and (best-effort) captures a
 *      short description from the page — skipped with --skip-fetch or when the
 *      curated entry already carries a description. Never fatal: a dead link is
 *      reported, not thrown, so a single 404 can't fail the whole sync.
 *   4. Runs toProgramSyncRecords to map + resolve every program to its utility.
 *   5. Publishes via applySync (entityType "program") unless --dry-run or
 *      DATABASE_URL is unset — mirroring scripts/sync-power-plants-monthly.ts.
 *   6. Prints a report (mapped / unresolved + methodCounts + URL health) and
 *      writes a manifest under data/iou-dr-programs/.
 *
 * Usage:
 *   npx tsx scripts/sync-iou-dr-programs.ts [--dry-run] [--skip-fetch]
 *
 * Output:
 *   data/iou-dr-programs/manifest.json   (bookkeeping — committed by the workflow)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { IOU_DR_REGISTRY, type RegistryEntry } from "@/data/iou-dr-programs/registry";
import { applySync } from "@/lib/sync/apply-sync";
import {
  IOU_DR_SYNC_ACTOR,
  PROGRAM_ENTITY_TYPE,
  type ScrapedProgram,
  toProgramSyncRecords,
} from "@/lib/sync/iou-dr-programs";
import type { ResolverUtility } from "@/lib/sync/resolve-entity";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const OUT_DIR = path.join(DATA_DIR, "iou-dr-programs");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const UTILITIES_PATH = path.join(DATA_DIR, "utilities.json");

/** Only these utility columns feed the resolver; keep the shape narrow + typed. */
interface UtilityRecord extends ResolverUtility {
  slug: string;
}

export interface UrlHealth {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  error?: string;
}

interface Manifest {
  source: string;
  generated_by: string;
  generated_at: string;
  registry_program_count: number;
  resolved_program_count: number;
  unresolved_program_count: number;
  method_counts: Record<string, number>;
  unresolved: Array<{ name: string; utility: ScrapedProgram["utility"] }>;
  url_health?: {
    checked: number;
    ok: number;
    broken: Array<{ name: string; url: string; status: number | null; error?: string }>;
  };
  notes: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no network, no filesystem)
// ---------------------------------------------------------------------------

/**
 * Convert a curated registry entry to the ScrapedProgram contract the mapper
 * consumes. Today this is a structural pass-through (the registry mirrors the
 * ScrapedProgram shape), optionally overriding `description` when the fetch
 * layer captured one from the live page. Kept as an explicit function so the
 * registry's data shape and the mapper's input contract can diverge later
 * without touching the fetch/publish flow.
 */
export function registryEntryToScraped(entry: RegistryEntry, description?: string): ScrapedProgram {
  return {
    name: entry.name,
    utility: {
      eiaId: entry.utility.eiaId ?? null,
      baCode: entry.utility.baCode ?? null,
      state: entry.utility.state ?? null,
      name: entry.utility.name ?? null,
    },
    description: description ?? entry.description,
    assetTypes: entry.assetTypes,
    deviceTypes: entry.deviceTypes,
    marketSegments: entry.marketSegments,
    participationModels: entry.participationModels,
    incentiveStructures: entry.incentiveStructures,
    gridServices: entry.gridServices,
    status: entry.status,
    programWebsite: entry.programWebsite,
    faqUrl: entry.faqUrl,
    termsUrl: entry.termsUrl,
    contactUrl: entry.contactUrl,
    dermsVendor: entry.dermsVendor,
  };
}

/**
 * Collapse an HTML document to a short plain-text snippet. Strips script/style,
 * tags, and decodes the handful of entities that show up in program blurbs.
 * Intentionally dependency-free and best-effort — used only to enrich a
 * description, never to drive schema-shaped facts (those come from the curated
 * registry). Returns "" when nothing useful is found.
 */
export function htmlToText(html: string, maxLen = 400): string {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  // Prefer the meta description when present — it's the utility's own summary.
  const meta =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(withoutBlocks)?.[1] ??
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(withoutBlocks)?.[1];

  const raw = meta ?? withoutBlocks.replace(/<[^>]+>/g, " ");
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trimEnd()}…` : text;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Validate that a string is a well-formed absolute http(s) URL. */
export function isValidHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Load only the resolver-relevant columns from a raw utilities.json array,
 * dropping anything without an id+slug (the mapper needs both). Pure so the
 * registry-validation test can exercise it against a fixture.
 */
export function toResolverUtilities(raw: unknown): UtilityRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: UtilityRecord[] = [];
  for (const u of raw as Array<Record<string, unknown>>) {
    if (typeof u.id !== "string" || typeof u.slug !== "string") continue;
    out.push({
      id: u.id,
      slug: u.slug,
      name: typeof u.name === "string" ? u.name : "",
      eiaId: (u.eiaId as string | number | null | undefined) ?? null,
      baCode: (u.baCode as string | null | undefined) ?? null,
      state: (u.state as string | null | undefined) ?? null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function loadUtilities(): UtilityRecord[] {
  const raw = JSON.parse(fs.readFileSync(UTILITIES_PATH, "utf-8"));
  return toResolverUtilities(raw);
}

/**
 * Best-effort HEAD/GET a program URL to confirm it's live and, on a GET,
 * capture a short description. Never throws: a network error or non-2xx is
 * reported as unhealthy so a dead link surfaces in the manifest without failing
 * the sync. Returns the captured description (if any) alongside health.
 */
async function checkUrl(
  name: string,
  url: string,
  wantDescription: boolean
): Promise<{ health: UrlHealth; description?: string }> {
  if (!isValidHttpUrl(url)) {
    return { health: { name, url, ok: false, status: null, error: "invalid URL" } };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "commongrid-iou-dr-sync/1.0 (+https://commongrid.org)" },
    });
    clearTimeout(timeout);

    let description: string | undefined;
    if (wantDescription && response.ok) {
      const html = await response.text();
      const text = htmlToText(html);
      if (text) description = text;
    }
    return {
      health: { name, url, ok: response.ok, status: response.status },
      description,
    };
  } catch (err) {
    return { health: { name, url, ok: false, status: null, error: String(err) } };
  }
}

async function publishToDatabase(records: Awaited<ReturnType<typeof toProgramSyncRecords>>["records"]): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "\n⚠️  DATABASE_URL is not set — skipping database publication. " +
        "The manifest is still written; the registry and changelog are NOT updated."
    );
    return;
  }

  console.log("\nPublishing IOU DR programs to the registry (Postgres)...");
  const report = await applySync(records, {
    entityType: PROGRAM_ENTITY_TYPE,
    initiatedBy: IOU_DR_SYNC_ACTOR,
    batchTitle: "IOU demand-response programs sync",
    batchDescription: `Curated IOU DR programs from ${IOU_DR_REGISTRY.length} registry entries`,
  });

  console.log("  Registry publication complete:");
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
}

function writeManifest(manifest: Manifest): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skipFetch = process.argv.includes("--skip-fetch");

  console.log("Syncing curated IOU demand-response programs\n");
  console.log(`  Registry entries: ${IOU_DR_REGISTRY.length}`);

  const utilities = loadUtilities();
  console.log(`  Utilities loaded: ${utilities.length.toLocaleString()}`);

  // URL health + optional description enrichment. Only fetch a page when we'd
  // actually use the description (entry has none) or to prove the link is live.
  const urlHealth: UrlHealth[] = [];
  const descriptions = new Map<string, string>();
  if (!skipFetch) {
    console.log("\n  Verifying program URLs (best-effort; failures are reported, not fatal)...");
    for (const entry of IOU_DR_REGISTRY) {
      const wantDescription = !entry.description;
      const { health, description } = await checkUrl(entry.name, entry.programWebsite, wantDescription);
      urlHealth.push(health);
      if (description) descriptions.set(`${entry.name}|${entry.programWebsite}`, description);
    }
    const okCount = urlHealth.filter((h) => h.ok).length;
    console.log(`    ${okCount}/${urlHealth.length} URLs responded OK`);
  } else {
    console.log("\n  --skip-fetch: not verifying URLs or capturing descriptions.");
  }

  const scraped: ScrapedProgram[] = IOU_DR_REGISTRY.map((entry) =>
    registryEntryToScraped(entry, descriptions.get(`${entry.name}|${entry.programWebsite}`))
  );

  const { records, unresolved, methodCounts } = toProgramSyncRecords(scraped, utilities);

  console.log("\n  Mapping result:");
  console.log(`    Mapped (resolved to a utility): ${records.length}`);
  console.log(`    Unresolved: ${unresolved.length}`);
  console.log(`    Method counts: ${JSON.stringify(methodCounts)}`);
  for (const u of unresolved) {
    console.log(`      ⚠️  UNRESOLVED: ${u.name} — ${JSON.stringify(u.utility)}`);
  }

  if (dryRun) {
    console.log("\n  --dry-run: not publishing to the database.");
  } else {
    await publishToDatabase(records);
  }

  const broken = urlHealth.filter((h) => !h.ok);
  const manifest: Manifest = {
    source: "Curated from utility public program pages (see data/iou-dr-programs/registry.ts)",
    generated_by: IOU_DR_SYNC_ACTOR,
    generated_at: new Date().toISOString(),
    registry_program_count: IOU_DR_REGISTRY.length,
    resolved_program_count: records.length,
    unresolved_program_count: unresolved.length,
    method_counts: methodCounts,
    unresolved,
    url_health: skipFetch
      ? undefined
      : {
          checked: urlHealth.length,
          ok: urlHealth.length - broken.length,
          broken: broken.map((h) => ({ name: h.name, url: h.url, status: h.status, error: h.error })),
        },
    notes: [
      'IOU DR programs are modeled into the existing `programs` entity (entityType "program"), linked to the administering utility via organizations[] by utility slug — NOT into the Utility model.',
      "There is no open federal catalog of named DR programs; facts are curated from each utility's public program page (registry.ts) and mapped by lib/sync/iou-dr-programs.ts.",
      "Re-runs are idempotent (stable prog- slug id) and conflict-aware (applySync policy B leaves human-edited fields untouched).",
    ],
  };
  writeManifest(manifest);

  console.log("\nIOU DR programs sync complete.");
}

const invokedDirectly = (() => {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("sync-iou-dr-programs.ts") || entry.endsWith("sync-iou-dr-programs.js");
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("IOU DR programs sync failed:", err);
    process.exit(1);
  });
}
