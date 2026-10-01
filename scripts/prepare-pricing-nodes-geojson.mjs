/**
 * Queries the `pricing_nodes` table from Postgres and writes a
 * FeatureCollection to `.tmp-pricing-nodes.geojson` for tippecanoe.
 *
 * Requires DATABASE_URL. Mirrors prepare-power-plants-geojson.mjs: the DB is
 * the source of truth for pricing-node geometry, so the tile build reads the
 * same rows the app serves rather than a committed JSON artifact (CG-331).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-pricing-nodes.geojson");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Exit 0, not 1. This is one layer in a multi-layer tile build; a missing
    // DB credential must not discard the other layers that were just generated
    // successfully. build-tiles.sh already handles a missing
    // .tmp-pricing-nodes.geojson by skipping tile generation for this layer.
    // (Same contract as prepare-power-plants-geojson.mjs — CIR-1271.)
    console.warn("⚠️  DATABASE_URL is not set — skipping pricing node GeoJSON. Pricing node tiles will not be rebuilt.");
    process.exit(0);
  }

  const sql = neon(url);

  const [{ exists }] = await sql`
    SELECT to_regclass('public.pricing_nodes') IS NOT NULL AS exists
  `;
  if (!exists) {
    console.warn("⚠️  public.pricing_nodes is not present — skipping pricing node GeoJSON.");
    process.exit(0);
  }

  const rows = await sql`
    SELECT
      slug,
      name,
      iso,
      node_type,
      latitude,
      longitude
    FROM public.pricing_nodes
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
        name: row.name,
        iso: row.iso,
        nodeType: row.node_type,
      },
      geometry: {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)],
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} pricing node features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
