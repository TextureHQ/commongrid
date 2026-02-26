/**
 * Sync script: Download all US EV charging stations from the DOE AFDC API.
 *
 * Uses the NREL Alternative Fuel Station Locator API to fetch all
 * electric vehicle (ELEC) stations in the US.
 *
 * Usage:
 *   cd opengrid
 *   npx tsx scripts/sync-ev-charging.ts
 *
 * Output:
 *   data/ev-charging.json
 *
 * API docs: https://developer.nrel.gov/docs/transportation/alt-fuel-stations-v1/
 */

import * as fs from "node:fs";
import * as path from "node:path";

const API_KEY = process.env.NREL_API_KEY ?? "DEMO_KEY";
const BASE_URL = "https://developer.nrel.gov/api/alt-fuel-stations/v1.json";
const LIMIT = 200;
// DEMO_KEY rate limits: ~10 req/hour for IP. Be very conservative.
// With a real NREL_API_KEY you get 1,000 req/hour — reduce this.
const DELAY_MS = API_KEY === "DEMO_KEY" ? 8000 : 1000;

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(name: string, city: string, state: string): string {
  const parts = [slugify(name), slugify(city), state.toLowerCase()].filter(Boolean);
  return parts.join("-");
}

interface AFDCStation {
  id: number;
  station_name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  ev_network: string | null;
  ev_level1_evse_num: number | null;
  ev_level2_evse_num: number | null;
  ev_dc_fast_num: number | null;
  ev_connector_types: string[] | null;
  access_code: string;
  status_code: string;
  open_date: string | null;
  facility_type: string | null;
  owner_type_code: string | null;
  ev_pricing: string | null;
}

interface AFDCResponse {
  total_results: number;
  fuel_stations: AFDCStation[];
}

async function fetchPage(offset: number, attempt = 0): Promise<AFDCResponse> {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("country", "US");
  url.searchParams.set("fuel_type", "ELEC");
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString());
  if (res.status === 429) {
    const waitMs = Math.min(60000 * (attempt + 1), 300000); // 60s, 120s, 180s, max 5min
    console.log(`\n   [429 Rate Limited] Waiting ${waitMs / 1000}s before retry (attempt ${attempt + 1})...`);
    await sleep(waitMs);
    return fetchPage(offset, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AFDC API error at offset=${offset}: ${res.status} ${res.statusText}\n${text}`);
  }
  return res.json() as Promise<AFDCResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Syncing EV charging stations from AFDC API (key: ${API_KEY === "DEMO_KEY" ? "DEMO_KEY" : "****"})\n`);

  // ── 1. Probe total results ───────────────────────────────────────────────
  console.log("1. Probing total results...");
  const firstPage = await fetchPage(0);
  const totalResults = firstPage.total_results;
  console.log(`   Total EV stations: ${totalResults}`);

  // ── 2. Paginate through all stations ────────────────────────────────────
  const allStations: AFDCStation[] = [...firstPage.fuel_stations];
  const totalPages = Math.ceil(totalResults / LIMIT);

  console.log(`\n2. Fetching ${totalPages} pages (${LIMIT} stations each)...`);

  for (let page = 1; page < totalPages; page++) {
    const offset = page * LIMIT;
    process.stdout.write(`   Page ${page + 1}/${totalPages} (offset=${offset})...`);
    await sleep(DELAY_MS);
    const pageData = await fetchPage(offset);
    allStations.push(...pageData.fuel_stations);
    process.stdout.write(` ${allStations.length} fetched so far\n`);
  }

  console.log(`\n   Total fetched: ${allStations.length} stations`);

  // ── 3. Transform and normalize ───────────────────────────────────────────
  console.log("\n3. Transforming station data...");

  const slugsSeen = new Map<string, number>();

  const stations = allStations
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => {
      const baseSlug = buildSlug(s.station_name || "unknown", s.city || "", s.state || "");
      const count = slugsSeen.get(baseSlug) ?? 0;
      slugsSeen.set(baseSlug, count + 1);
      const slug = count === 0 ? baseSlug : `${baseSlug}-${s.id}`;

      return {
        id: `ev-${s.id}`,
        slug,
        stationName: (s.station_name || "").trim(),
        streetAddress: (s.street_address || "").trim(),
        city: (s.city || "").trim(),
        state: (s.state || "").trim(),
        zip: (s.zip || "").trim(),
        latitude: s.latitude as number,
        longitude: s.longitude as number,
        evNetwork: s.ev_network ?? null,
        evLevel1EvseNum: s.ev_level1_evse_num ?? 0,
        evLevel2EvseNum: s.ev_level2_evse_num ?? 0,
        evDcFastNum: s.ev_dc_fast_num ?? 0,
        evConnectorTypes: s.ev_connector_types ?? [],
        accessCode: (s.access_code || "public") as "public" | "private" | "restricted",
        statusCode: (s.status_code || "E") as "E" | "P" | "T",
        openDate: s.open_date ?? null,
        facilityType: s.facility_type ?? null,
        ownerTypeCode: s.owner_type_code ?? null,
        evPricing: s.ev_pricing ?? null,
      };
    });

  const skipped = allStations.length - stations.length;
  if (skipped > 0) {
    console.log(`   Skipped ${skipped} stations with missing coordinates`);
  }

  // ── 4. Sort by name ────────────────────────────────────────────────────
  stations.sort((a, b) => a.stationName.localeCompare(b.stationName));

  // ── 5. Write output ───────────────────────────────────────────────────
  console.log("\n4. Writing output...");
  const outPath = path.join(process.cwd(), "data", "ev-charging.json");
  fs.writeFileSync(outPath, `${JSON.stringify(stations)}\n`);
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`   Wrote ${outPath} (${sizeMb} MB)`);

  // ── Summary ────────────────────────────────────────────────────────────
  const networkCounts = new Map<string, number>();
  let totalL1 = 0;
  let totalL2 = 0;
  let totalDCFast = 0;
  let publicCount = 0;
  let openCount = 0;

  for (const s of stations) {
    const net = s.evNetwork ?? "Non-Networked";
    networkCounts.set(net, (networkCounts.get(net) ?? 0) + 1);
    totalL1 += s.evLevel1EvseNum;
    totalL2 += s.evLevel2EvseNum;
    totalDCFast += s.evDcFastNum;
    if (s.accessCode === "public") publicCount++;
    if (s.statusCode === "E") openCount++;
  }

  console.log("\nSync complete:");
  console.log(`  Total stations: ${stations.length.toLocaleString()}`);
  console.log(`  Open (status E): ${openCount.toLocaleString()}`);
  console.log(`  Public access: ${publicCount.toLocaleString()}`);
  console.log(`  Total Level 1 ports: ${totalL1.toLocaleString()}`);
  console.log(`  Total Level 2 ports: ${totalL2.toLocaleString()}`);
  console.log(`  Total DC Fast ports: ${totalDCFast.toLocaleString()}`);
  console.log(`  Total connectors: ${(totalL1 + totalL2 + totalDCFast).toLocaleString()}`);

  console.log("\n  By network (top 10):");
  const sortedNetworks = [...networkCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [net, count] of sortedNetworks) {
    console.log(`    ${net}: ${count.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
