/**
 * Queries the `territories` table from Postgres and writes a
 * FeatureCollection to `.tmp-territories.geojson` for tippecanoe.
 *
 * Joins regions + utilities so the tile properties match the previous
 * file-based output (name, eiaId, slug, segment, state, customerCount, baCode).
 *
 * Requires DATABASE_URL. Mirrors prepare-substations-geojson.mjs and
 * prepare-power-plants-geojson.mjs: the DB is the source of truth for
 * territory geometry, so the tile build reads the same rows the app serves
 * rather than committed JSON artifacts (CG-330).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-territories.geojson");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Exit 0, not 1. This is one optional layer in a multi-layer tile build;
    // a missing DB credential must not discard the other layers that were just
    // generated successfully. build-tiles.sh already handles a missing
    // .tmp-territories.geojson by skipping tile generation for this layer
    // (CIR-1271).
    console.warn("⚠️  DATABASE_URL is not set — skipping territory GeoJSON. Territory tiles will not be rebuilt.");
    process.exit(0);
  }

  const sql = neon(url);

  const [{ exists }] = await sql`
    SELECT to_regclass('public.territories') IS NOT NULL AS exists
  `;
  if (!exists) {
    console.warn("⚠️  public.territories is not present — skipping territory GeoJSON.");
    process.exit(0);
  }

  const rows = await sql`
    SELECT
      r.id AS region_id,
      r.slug AS region_slug,
      r.name AS region_name,
      r.state AS region_state,
      r.eia_id AS region_eia_id,
      u.id AS utility_id,
      u.name AS utility_name,
      u.slug AS utility_slug,
      u.segment AS utility_segment,
      u.customer_count AS utility_customer_count,
      u.ba_code AS utility_ba_code,
      ST_AsGeoJSON(t.geography) AS geojson
    FROM territories t
    JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL
    LEFT JOIN utilities u ON u.service_territory_id = r.id AND u.deleted_at IS NULL
    WHERE t.deleted_at IS NULL
  `;

  const features = [];
  for (const row of rows) {
    const geometry = row.geojson ? JSON.parse(row.geojson) : null;
    if (!geometry) continue;

    const properties = {
      name: row.utility_name ?? row.region_name,
      eiaId: row.region_eia_id,
      slug: row.utility_slug ?? row.region_slug,
      segment: row.utility_segment ?? null,
      state: row.region_state,
      customerCount: row.utility_customer_count ?? 0,
      baCode: row.utility_ba_code ?? null,
    };

    features.push({
      type: "Feature",
      properties,
      geometry,
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} territory features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
