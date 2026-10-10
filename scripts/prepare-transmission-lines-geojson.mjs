/**
 * Queries the `transmission_lines` table from Postgres and writes a
 * FeatureCollection to `.tmp-transmission-lines.geojson` for tippecanoe.
 *
 * Geometry is stored in PostGIS (CG-328) and read back via ST_AsGeoJSON, so
 * there is no committed data/transmission-lines.geojson artifact anymore.
 *
 * Voltage class is written as a numeric `voltageRank` so tippecanoe can use it
 * for zoom-level filtering.
 *
 * Requires DATABASE_URL.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-transmission-lines.geojson");

// Numeric voltageRank for zoom-based filtering:
//   4 = extra-high (345kV+) → show at all zooms
//   3 = high (230–344kV)     → tippecanoe drops some at low zoom
//   2 = medium (115–229kV)   → drop more at low zoom
//   1 = sub-trans (69–114kV) → drop most at low zoom
//   0 = unknown
const rankMap = { "extra-high": 4, high: 3, medium: 2, "sub-trans": 1, unknown: 0 };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Exit 0, not 1. This is one optional layer in a multi-layer tile build;
    // a missing DB credential must not discard the other layers that were just
    // generated successfully. build-tiles.sh already handles a missing
    // .tmp-transmission-lines.geojson by skipping tile generation for this
    // layer (mirrors prepare-substations-geojson.mjs — CIR-1271).
    console.warn(
      "⚠️  DATABASE_URL is not set — skipping transmission-line GeoJSON. Transmission tiles will not be rebuilt."
    );
    process.exit(0);
  }

  const sql = neon(url);

  const rows = await sql`
    SELECT
      id,
      object_id,
      voltage,
      voltage_class,
      owner,
      status,
      type,
      length_miles,
      ST_AsGeoJSON(geometry) AS geometry
    FROM transmission_lines
    WHERE deleted_at IS NULL
      AND geometry IS NOT NULL
  `;

  const features = [];
  for (const row of rows) {
    let geometry;
    try {
      geometry = JSON.parse(row.geometry);
    } catch {
      continue;
    }
    if (!geometry) continue;

    const vc = row.voltage_class ?? "unknown";
    features.push({
      type: "Feature",
      geometry,
      properties: {
        objectId: row.object_id,
        id: row.id,
        voltage: row.voltage === null ? null : Number(row.voltage),
        voltageClass: vc,
        voltageRank: rankMap[vc] ?? 0,
        owner: row.owner,
        status: row.status,
        type: row.type,
        lengthMiles: row.length_miles === null ? null : Number(row.length_miles),
      },
    });
  }

  if (features.length === 0) {
    console.warn("⚠️  No transmission line features found — skipping transmission line GeoJSON.");
    process.exit(0);
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} transmission line features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
