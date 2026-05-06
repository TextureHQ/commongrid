/**
 * One-shot: push `utilities.domains` from data/utilities.json → Neon.
 *
 * Use when the JSON is already authoritative (e.g. just after running
 * `npm run backfill:utility-domains`) and you want the DB synced without
 * re-deriving domains. Safe to re-run; per-row UPDATE is idempotent.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/push-utility-domains-to-db.ts
 *   DATABASE_URL=... npx tsx scripts/push-utility-domains-to-db.ts --dry-run
 */

import { neon } from "@neondatabase/serverless";
import { readJSON } from "./lib";

interface UtilityRecord {
  id: string;
  slug: string;
  domains?: string[] | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const utilities = readJSON<UtilityRecord[]>("utilities.json");
  const withDomains = utilities.filter((u) => Array.isArray(u.domains) && u.domains.length > 0);

  console.log(`🧭 Pushing utilities.domains to DB`);
  console.log(`   Records to push: ${withDomains.length} / ${utilities.length}`);
  console.log(`   Mode: ${dryRun ? "dry-run" : "write"}`);

  if (dryRun) return;

  const sql = neon(process.env.DATABASE_URL);

  let written = 0;
  for (const u of withDomains) {
    const res = await sql`
      UPDATE "utilities"
         SET "domains" = ${u.domains}
       WHERE "slug" = ${u.slug}
         AND "deleted_at" IS NULL
    `;
    // neon-http returns an array-like with rowCount metadata; guard both shapes.
    const rowCount = (res as unknown as { rowCount?: number }).rowCount ?? (Array.isArray(res) ? res.length : 0);
    written += rowCount;
    if (written > 0 && written % 250 === 0) {
      console.log(`   ... ${written} rows`);
    }
  }
  console.log(`✅ DB: updated ${written} utilities.domains rows`);
}

main().catch((err) => {
  console.error("Push failed:", err);
  process.exit(1);
});
