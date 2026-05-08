/**
 * Queries the `substations` table from Postgres and writes a
 * FeatureCollection to `.tmp-substations.geojson` for tippecanoe.
 *
 * Requires DATABASE_URL.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const OUTPUT = join(process.cwd(), ".tmp-substations.geojson");

function voltageBandForMax(kv) {
  if (kv === null || kv === undefined) return "unknown";
  if (kv >= 345) return "extra-high";
  if (kv >= 230) return "high";
  if (kv >= 115) return "medium";
  if (kv >= 69) return "sub-trans";
  return "unknown";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);

  const rows = await sql`
    SELECT
      id,
      slug,
      name,
      owner_name,
      state,
      county,
      latitude,
      longitude,
      min_voltage_kv,
      max_voltage_kv,
      substation_type,
      status,
      source
    FROM substations
    WHERE deleted_at IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  `;

  const features = [];
  for (const row of rows) {
    const minV = row.min_voltage_kv === null ? null : Number(row.min_voltage_kv);
    const maxV = row.max_voltage_kv === null ? null : Number(row.max_voltage_kv);
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)],
      },
      properties: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        ownerName: row.owner_name,
        state: row.state,
        county: row.county,
        minVoltageKv: minV,
        maxVoltageKv: maxV,
        voltageBand: voltageBandForMax(maxV ?? minV),
        substationType: row.substation_type,
        status: row.status,
        source: row.source,
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} substation features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
