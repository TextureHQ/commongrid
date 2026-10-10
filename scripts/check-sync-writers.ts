#!/usr/bin/env tsx
/**
 * CI guard: prevent recurring sync scripts from bypassing the protected writer.
 *
 * Context: CG-333. Contributable entities (utility, power_plant, ev_station,
 * pricing_node, program) must be written by `lib/sync/apply-sync.ts` so that
 * human-authored fields are never silently overwritten by an upstream sync.
 * This script fails CI if a new raw `onConflictDoUpdate`, raw SQL
 * `ON CONFLICT ... DO UPDATE`, or direct `.insert(<contributableTable>)` on a
 * contributable entity appears in `scripts/` outside the approved writer.
 *
 * Usage:
 *   npx tsx scripts/check-sync-writers.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

const SCRIPTS_DIR = path.resolve(__dirname);

/**
 * Files that legitimately write non-contributable tables directly.
 * Each entry must include an inline comment explaining why it is exempt.
 */
const ALLOWLIST = new Map<string, string>([
  // Substations are not a contributable entity (no entry in
  // community_editable_fields), so raw upserts do not risk clobbering a
  // human-approved field.
  ["sync-substations.ts", "substation is not community-editable"],

  // Transmission lines are not a contributable entity.
  ["sync-transmission-lines.ts", "transmission_line is not community-editable"],

  // Transmission line endpoints are a join table, not a contributable entity.
  ["sync-transmission-line-endpoints.ts", "transmission_line_endpoint is not community-editable"],

  // Power-plant interconnections are a join table, not a contributable entity.
  ["sync-power-plant-interconnections.ts", "power_plant_interconnection is not community-editable"],

  // One-off geometry backfill for the non-contributable territories table.
  ["backfill-service-territory-geoms.ts", "one-time territory geometry backfill"],

  // One-time seed script for core tables; not a recurring upstream sync.
  ["seed-database.ts", "one-time seed script"],

  // This guard script references the patterns it is searching for.
  ["check-sync-writers.ts", "sync-writer guard script"],
]);

/** Entity tables that must be written through applySync. */
const CONTRIBUTABLE_TABLES = ["evStations", "powerPlants", "pricingNodes", "programs", "utilities"];

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: "drizzle onConflictDoUpdate",
    regex: /\.onConflictDoUpdate\s*\(/,
  },
  {
    name: "raw SQL ON CONFLICT DO UPDATE",
    regex: /ON\s+CONFLICT\s+[^(]*\)\s*DO\s+UPDATE\s+SET/i,
  },
  {
    name: "direct insert of contributable table",
    regex: new RegExp(`\\.insert\\(\\s*(?:${CONTRIBUTABLE_TABLES.join("|")})\\s*\\)`),
  },
];

function findViolations(): Violation[] {
  const files = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();

  const violations: Violation[] = [];

  for (const file of files) {
    const reason = ALLOWLIST.get(file);
    if (reason) continue;

    const filePath = path.join(SCRIPTS_DIR, file);
    const source = fs.readFileSync(filePath, "utf-8");
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Ignore comments so the guard does not flag its own documentation.
      const code = line.replace(/\/\/.*$/, "");
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(code)) {
          violations.push({
            file,
            line: i + 1,
            text: line.trim(),
            pattern: pattern.name,
          });
        }
      }
    }
  }

  return violations;
}

function main(): void {
  const violations = findViolations();

  if (violations.length === 0) {
    console.log("✅ No raw contributable-table writes found outside the approved sync writer.");
    process.exit(0);
  }

  console.error("❌ Found raw writes to contributable entity tables outside lib/sync/apply-sync.ts:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.text}`);
  }
  console.error(
    "\nIf this is intentional, add the file to ALLOWLIST in scripts/check-sync-writers.ts with a comment explaining why."
  );
  process.exit(1);
}

main();
