/**
 * Queries the `ev_stations` table from Postgres and writes a
 * FeatureCollection to `.tmp-ev-charging.geojson` for tippecanoe.
 *
 * Requires DATABASE_URL. Mirrors prepare-power-plants-geojson.mjs and
 * prepare-substations-geojson.mjs: the DB is the source of truth for EV
 * charging geometry, so the tile build reads the same rows the app serves
 * rather than a committed JSON artifact (CG-326).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-ev-charging.geojson");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Exit 0, not 1. This is one layer in a multi-layer tile build; a missing
    // DB credential must not discard the other layers that were just generated
    // successfully. build-tiles.sh already handles a missing
    // .tmp-ev-charging.geojson by skipping tile generation for this layer.
    // (Same contract as prepare-power-plants-geojson.mjs and
    // prepare-substations-geojson.mjs — CIR-1271.)
    console.warn("⚠️  DATABASE_URL is not set — skipping EV charging GeoJSON. EV charging tiles will not be rebuilt.");
    process.exit(0);
  }

  const sql = neon(url);

  const [{ exists }] = await sql`
    SELECT to_regclass('public.ev_stations') IS NOT NULL AS exists
  `;
  if (!exists) {
    console.warn("⚠️  public.ev_stations is not present — skipping EV charging GeoJSON.");
    process.exit(0);
  }

  const rows = await sql`
    SELECT
      slug,
      station_name,
      ev_network,
      ev_dc_fast_num,
      ev_level2_evse_num,
      ev_level1_evse_num,
      access_code,
      status_code,
      facility_type,
      latitude,
      longitude
    FROM public.ev_stations
    WHERE deleted_at IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  `;

  const features = [];
  for (const row of rows) {
    features.push({
      type: "Feature",
      properties: {
        slug: row.slug,
        name: row.station_name,
        network: row.ev_network ?? "Non-Networked",
        dcFastCount: row.ev_dc_fast_num ?? 0,
        level2Count: row.ev_level2_evse_num ?? 0,
        level1Count: row.ev_level1_evse_num ?? 0,
        accessCode: row.access_code,
        status: row.status_code,
        facilityType: row.facility_type ?? "",
      },
      geometry: {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)],
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} EV charging features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
