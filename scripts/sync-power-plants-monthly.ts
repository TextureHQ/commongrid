/**
 * Sync script: Check for and apply EIA-860M monthly preliminary updates.
 *
 * The EIA-860M provides monthly updates on generator status changes,
 * new plants, retirements, and capacity changes between annual releases.
 *
 * Usage:
 *   npx tsx scripts/sync-power-plants-monthly.ts
 *
 * This script:
 *   1. Checks the EIA-860M page for the latest available month
 *   2. Downloads the monthly XLSX if newer than our data
 *   3. Merges updates into data/power-plants.json
 *
 * Note: The EIA-860M format may change between releases. This script
 * currently serves as a placeholder structure — the parsing logic will
 * need to be updated once we examine the actual monthly file format.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readJSON, writeJSON } from "./lib";

const EIA_860M_PAGE = "https://www.eia.gov/electricity/data/eia860m/";
const TEMP_DIR = path.join(os.tmpdir(), "eia860m-sync");

async function checkLatestMonth(): Promise<string | null> {
  console.log("  Checking EIA-860M page for latest month...");
  try {
    const response = await fetch(EIA_860M_PAGE);
    if (!response.ok) {
      console.warn(`  Warning: EIA-860M page returned ${response.status}`);
      return null;
    }
    const html = await response.text();

    // Look for the latest XLSX download link
    const matches = html.match(/eia860m(\d{4})\.xlsx/gi);
    if (!matches || matches.length === 0) {
      console.log("  No monthly files found on EIA-860M page");
      return null;
    }

    // Return the latest one
    const latest = matches.sort().pop()!;
    console.log(`  Latest available: ${latest}`);
    return latest;
  } catch (err) {
    console.warn(`  Warning: Could not check EIA-860M page: ${err}`);
    return null;
  }
}

async function main() {
  console.log("Checking for EIA-860M monthly updates\n");

  const latestFile = await checkLatestMonth();
  if (!latestFile) {
    console.log("\nNo updates available. Exiting.");
    return;
  }

  // Check if we already have this month's data
  const markerPath = path.join(process.cwd(), "data", ".eia860m-last-sync");
  if (fs.existsSync(markerPath)) {
    const lastSync = fs.readFileSync(markerPath, "utf-8").trim();
    if (lastSync === latestFile) {
      console.log(`\nAlready synced ${latestFile}. No update needed.`);
      return;
    }
  }

  console.log(`\nNew monthly data available: ${latestFile}`);
  console.log("TODO: Download and parse monthly updates");
  console.log("      (Monthly parsing logic will be implemented when the format is confirmed)");

  // Write marker so we don't re-check
  // fs.writeFileSync(markerPath, latestFile);
  // console.log(`\nMonthly sync complete. Marker updated to ${latestFile}`);
}

main().catch((err) => {
  console.error("Monthly sync failed:", err);
  process.exit(1);
});
