/**
 * Queries the `power_plants` table from Postgres and writes a
 * FeatureCollection to `.tmp-power-plants.geojson` for tippecanoe.
 *
 * Requires DATABASE_URL. Mirrors prepare-substations-geojson.mjs: the DB is
 * the source of truth for power-plant geometry, so the tile build reads the
 * same rows the app serves rather than a committed JSON artifact (CG-266).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-power-plants.geojson");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Exit 0, not 1. This is one layer in a multi-layer tile build; a missing
    // DB credential must not discard the other layers that were just generated
    // successfully. build-tiles.sh already handles a missing
    // .tmp-power-plants.geojson by skipping tile generation for this layer.
    // (Same contract as prepare-substations-geojson.mjs — CIR-1271.)
    console.warn("⚠️  DATABASE_URL is not set — skipping power plant GeoJSON. Power plant tiles will not be rebuilt.");
    process.exit(0);
  }

  const sql = neon(url);

  const [{ exists }] = await sql`
    SELECT to_regclass('public.power_plants') IS NOT NULL AS exists
  `;
  if (!exists) {
    console.warn("⚠️  public.power_plants is not present — skipping power plant GeoJSON.");
    process.exit(0);
  }

  const rows = await sql`
    SELECT
      slug,
      name,
      fuel_category,
      status,
      total_capacity_mw,
      proposed_capacity_mw,
      latitude,
      longitude
    FROM public.power_plants
    WHERE deleted_at IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  `;

  const features = [];
  for (const row of rows) {
    const totalCapacity = row.total_capacity_mw === null ? null : Number(row.total_capacity_mw);
    const proposedCapacity = row.proposed_capacity_mw === null ? null : Number(row.proposed_capacity_mw);
    features.push({
      type: "Feature",
      properties: {
        slug: row.slug,
        name: row.name,
        fuelCategory: row.fuel_category,
        // Match the previous JSON-derived semantics exactly: operable plants
        // render on installed capacity, proposed plants on their proposed
        // capacity (0 when unknown).
        capacityMw: row.status === "operable" ? totalCapacity : (proposedCapacity ?? 0),
        status: row.status,
      },
      geometry: {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)],
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} power plant features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
