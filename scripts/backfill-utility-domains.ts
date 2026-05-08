/**
 * Backfill script: populate `utilities.domains` from available sources.
 *
 * Motivation: researchers, journalists, and developers joining an external
 * dataset to utilities (news mentions, email sign-ups, complaint logs) need
 * a list of web/email domains per utility. Previously only `website`
 * existed, which gave at most one domain per org and didn't capture
 * multi-domain utilities (e.g. `example-coop.com` + `example-coop.coop`).
 *
 * Sources (in priority order):
 *   1. `KNOWN_UTILITY_DOMAINS` below — a curated seed list of multi-domain
 *      orgs (big IOUs with subsidiary brands, well-known co-ops). These win
 *      over heuristics because they're the cases where the single-domain
 *      website heuristic is demonstrably wrong.
 *   2. Existing `domains` value on the record — preserved via union if
 *      already set (community contributions / manual overrides should not
 *      be clobbered).
 *   3. NRECA directory — optional drop at `data/nreca-directory.json` with
 *      shape `[{ eiaId?: string, name?: string, domains: string[] }]`.
 *      The file is gitignored / optional; when absent we fall back cleanly.
 *   4. EIA-861 — not a source of web domains (filings don't carry them),
 *      but kept as a placeholder hook for future enrichment.
 *   5. Website-derived fallback — parse `new URL(website).hostname`, strip
 *      `www.`, and emit a single-element array.
 *
 * Targets:
 *   - Rewrites `data/utilities.json` in place (source of truth for the
 *     build pipeline / seed script).
 *   - If `DATABASE_URL` is set and `--db` is passed, also updates the
 *     `utilities.domains` column in Neon Postgres for every record whose
 *     domains changed.
 *
 * Usage:
 *   npm run backfill:utility-domains          # rewrite data/utilities.json
 *   npm run backfill:utility-domains:db       # ...and push to Neon
 *   npm run backfill:utility-domains:dry      # report only, no writes
 *
 * Idempotent: running repeatedly converges to the same result.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR, readJSON, writeJSON } from "./lib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UtilityRecord {
  id: string;
  slug: string;
  name: string;
  eiaId: string | null;
  website: string | null;
  domains?: string[] | null;
  [key: string]: unknown;
}

interface NrecaEntry {
  eiaId?: string | null;
  name?: string;
  domains: string[];
}

// ---------------------------------------------------------------------------
// Curated multi-domain seed list
// ---------------------------------------------------------------------------

/**
 * Multi-domain utilities where the single-website heuristic is demonstrably
 * insufficient. Seeded from publicly-visible brand pages (EIA-861 "ownership
 * / subsidiaries" rollups, company "our brands" pages).
 *
 * Keep entries narrow and verifiable — this is not a marketing list, it's
 * the basis for domain-scoped lookups, so false positives matter more than
 * missing entries (missing is easily fixed later via community edit).
 */
const KNOWN_UTILITY_DOMAINS: Record<string, string[]> = {
  // Large IOUs with multi-brand subsidiary domains
  "duke-energy": ["duke-energy.com"],
  exelon: [
    "exeloncorp.com",
    "comed.com",
    "peco.com",
    "bge.com",
    "pepco.com",
    "delmarva.com",
    "atlanticcityelectric.com",
  ],
  "nextera-energy": ["nexteraenergy.com", "fpl.com"],
  "american-electric-power": ["aep.com"],
  "xcel-energy": ["xcelenergy.com"],
  entergy: ["entergy.com"],
  "dominion-energy": ["dominionenergy.com"],
  "southern-company": ["southerncompany.com", "georgiapower.com", "alabamapower.com", "mississippipower.com"],
  firstenergy: ["firstenergycorp.com"],
  "eversource-energy": ["eversource.com"],
  "pgande-corporation": ["pge.com", "pgecorp.com"],
  "edison-international": ["edison.com", "sce.com"],
  "consolidated-edison": ["coned.com", "conedison.com"],

  // Public power / muni-scale examples where the official .gov differs
  // from the utility-facing brand
  "tennessee-valley-authority": ["tva.com", "tva.gov"],
  "bonneville-power-administration": ["bpa.gov"],
  "new-york-power-authority": ["nypa.gov"],

  // Large co-ops whose NRECA listings include multi-TLD
  "tri-state": ["tristate.coop", "tristategt.org"],
  "green-mountain-power": ["greenmountainpower.com"],
};

// ---------------------------------------------------------------------------
// Domain extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a canonical hostname from a website string.
 * - Accepts raw domains (`example.com`) as well as full URLs (`https://…`).
 * - Lowercases everything.
 * - Strips leading `www.`.
 * - Strips port + path + query + fragment.
 * - Returns null for anything that doesn't resolve to a plausible hostname.
 */
export function domainFromWebsite(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Bare domain — give it a scheme so URL() cooperates.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!host) return null;
  if (host.startsWith("www.")) host = host.slice(4);

  // Reject obvious junk. A valid domain must contain at least one dot and no
  // whitespace / slashes.
  if (!host.includes(".")) return null;
  if (/\s|\//.test(host)) return null;

  return host;
}

/**
 * Merge and de-duplicate a list of domains while preserving original order.
 * Runs everything through `domainFromWebsite` so callers can pass in raw
 * URLs and the list comes out normalized.
 */
export function mergeDomains(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const d = domainFromWebsite(raw);
      if (!d) continue;
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Optional NRECA directory loader
// ---------------------------------------------------------------------------

function loadNrecaDirectory(): Map<string, NrecaEntry> {
  const p = path.join(DATA_DIR, "nreca-directory.json");
  if (!fs.existsSync(p)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as NrecaEntry[];
    const byEiaId = new Map<string, NrecaEntry>();
    for (const entry of raw) {
      if (entry.eiaId) byEiaId.set(String(entry.eiaId), entry);
    }
    console.log(`  Loaded NRECA directory: ${byEiaId.size} entries keyed by eiaId`);
    return byEiaId;
  } catch (err) {
    console.warn(`  ⚠️ NRECA directory exists but failed to parse: ${(err as Error).message}`);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const writeToDb = args.has("--db");

  console.log("🧭 Backfilling utilities.domains");
  console.log(`   Mode: ${dryRun ? "dry-run" : "write"}, DB: ${writeToDb ? "yes" : "no"}`);

  const utilities = readJSON<UtilityRecord[]>("utilities.json");
  const nreca = loadNrecaDirectory();

  let changed = 0;
  let unchanged = 0;
  let populated = 0;
  let stillEmpty = 0;
  const diffs: Array<{ slug: string; before: string[] | null; after: string[] }> = [];

  for (const u of utilities) {
    const existing = Array.isArray(u.domains) ? u.domains : null;

    const curated = KNOWN_UTILITY_DOMAINS[u.slug] ?? null;

    const nrecaEntry = u.eiaId ? nreca.get(String(u.eiaId)) : undefined;
    const nrecaDomains = nrecaEntry?.domains ?? null;

    const websiteDomain = domainFromWebsite(u.website);
    const websiteList = websiteDomain ? [websiteDomain] : [];

    // Priority: curated seed > existing (community) > NRECA > website fallback.
    const next = mergeDomains(curated, existing, nrecaDomains, websiteList);

    // Normalize: empty arrays get stored as null so the API response
    // contains a nullable array rather than "[]".
    const normalized = next.length > 0 ? next : null;

    const before = existing && existing.length > 0 ? existing : null;
    const sameAsBefore =
      before === normalized ||
      (before !== null &&
        normalized !== null &&
        before.length === normalized.length &&
        before.every((v, i) => v === normalized[i]));

    if (sameAsBefore) {
      unchanged++;
    } else {
      changed++;
      diffs.push({ slug: u.slug, before, after: normalized ?? [] });
      u.domains = normalized;
    }

    if (normalized && normalized.length > 0) populated++;
    else stillEmpty++;
  }

  console.log("\n📊 Backfill summary");
  console.log(`   Utilities processed: ${utilities.length}`);
  console.log(`   Changed:             ${changed}`);
  console.log(`   Unchanged:           ${unchanged}`);
  console.log(`   Now with domains:    ${populated}`);
  console.log(`   Still empty:         ${stillEmpty}`);

  if (diffs.length > 0) {
    console.log("\n   Sample changes (first 5):");
    for (const d of diffs.slice(0, 5)) {
      console.log(`     ${d.slug}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
    }
  }

  if (dryRun) {
    console.log("\n(dry-run) no files or DB rows written");
    return;
  }

  writeJSON("utilities.json", utilities);
  console.log(`✅ Wrote data/utilities.json (${changed} records updated)`);

  if (writeToDb) {
    await writeDomainsToDb(diffs, utilities);
  } else {
    console.log("   (skipping DB write — rerun with --db to push to Neon)");
  }
}

async function writeDomainsToDb(
  diffs: Array<{ slug: string; before: string[] | null; after: string[] }>,
  utilities: UtilityRecord[]
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️ --db requested but DATABASE_URL is not set; skipping DB write.");
    return;
  }
  if (diffs.length === 0) {
    console.log("   DB: nothing to write.");
    return;
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const bySlug = new Map(utilities.map((u) => [u.slug, u.domains ?? null]));

  try {
    let written = 0;
    for (const d of diffs) {
      const domains = bySlug.get(d.slug);
      await pool.query(
        'UPDATE "utilities" SET "domains" = $1, "updated_at" = now() WHERE "slug" = $2 AND "deleted_at" IS NULL',
        [domains, d.slug]
      );
      written++;
    }
    console.log(`✅ DB: updated ${written} utilities.domains rows`);
  } finally {
    await pool.end();
  }
}

// Only run when executed directly (not when imported by tests).
const invokedDirectly = (() => {
  try {
    const entry = process.argv[1] ?? "";
    return entry.endsWith("backfill-utility-domains.ts") || entry.endsWith("backfill-utility-domains.js");
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}
