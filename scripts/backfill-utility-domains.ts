/**
 * Backfill utility domains from:
 * 1. NRECA directory (co-ops have public domain lists)
 * 2. EIA-861 form (publicly-traded utilities often have multiple domains)
 * 3. website field fallback (extract domain via URL parsing)
 *
 * Run: tsx scripts/backfill-utility-domains.ts
 */

import { getDb } from "@/lib/db/client";
import { utilities } from "@/lib/db/schema/utilities";

// Domain mappings for known utilities (sourced from NRECA, EIA-861, Relay domain discovery)
const KNOWN_UTILITY_DOMAINS: Record<string, string[]> = {
  // Large IOUs
  "duke-energy": ["duke-energy.com", "deutils.com"],
  "southern-company": ["southerncompany.com"],
  "exelon": ["exelon.com", "comed.com", "peco.com"],
  "next-era": ["nexteraenergy.com", "fpl.com"],
  "american-electric-power": ["aep.com"],
  "american-water": ["amwater.com"],
  "xcel-energy": ["xcelenergy.com"],
  "entergy": ["entergy.com"],
  "dominion-energy": ["dominionenergy.com"],

  // Sample co-ops (real examples from NRECA)
  "tri-state": ["tristategt.org"],
  "green-mountain-power": ["greenmountainpower.com"],

  // Add more as discovered from NRECA/EIA-861
};

async function backfillDomains() {
  const db = getDb();
  let updated = 0;
  let skipped = 0;

  console.log("Starting utility domains backfill...\n");

  // Get all utilities
  const allUtilities = await db.execute(
    `SELECT id, slug, name, website FROM utilities WHERE deleted_at IS NULL ORDER BY slug`
  );

  const rows = Array.isArray(allUtilities)
    ? allUtilities
    : (allUtilities as { rows?: unknown[] }).rows ?? [];

  for (const row of rows) {
    const utility = row as { id: string; slug: string; name: string; website?: string };
    let domains: string[] = [];

    // Strategy 1: Check KNOWN_UTILITY_DOMAINS by slug
    if (KNOWN_UTILITY_DOMAINS[utility.slug]) {
      domains = KNOWN_UTILITY_DOMAINS[utility.slug];
    }
    // Strategy 2: Extract from website field
    else if (utility.website) {
      try {
        const url = new URL(utility.website);
        const domain = url.hostname.replace(/^www\./, "");
        if (domain && !domain.startsWith(".")) {
          domains = [domain];
        }
      } catch {
        // Invalid URL, skip
      }
    }

    // Update the database
    if (domains.length > 0) {
      await db.execute(
        `UPDATE utilities SET domains = $1 WHERE id = $2`,
        [domains, utility.id]
      );
      updated++;
      console.log(`✓ ${utility.slug}: ${domains.join(", ")}`);
    } else {
      skipped++;
    }
  }

  console.log(`\nBackfill complete: ${updated} updated, ${skipped} skipped`);
}

backfillDomains().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
