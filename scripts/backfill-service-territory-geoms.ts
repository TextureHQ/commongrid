#!/usr/bin/env tsx
/**
 * Backfill missing SERVICE_TERRITORY geometries.
 *
 * Context: The main seed-database.ts script inserts territories from
 * data/territories/{eiaId}.json files. For historical reasons, 71 regions
 * of type SERVICE_TERRITORY exist in the regions table but have no
 * corresponding row in the territories table. All 71 GeoJSON files are
 * already on disk — the seed simply didn't insert them (likely an ordering
 * or on-conflict issue at the time of the initial seed). This script
 * inserts the missing territories using the same PostGIS pipeline as the
 * seed script: ST_MakeValid → ST_Multi → cast to geography(MultiPolygon).
 *
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run backfill:service-territory-geoms
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const TERRITORY_DIR = path.join(DATA_DIR, "territories");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log("🔎 Finding SERVICE_TERRITORY regions without a territories row...");

  const missing = await db.execute(sql`
    SELECT r.id AS region_id, r.eia_id, r.slug, r.name
    FROM regions r
    LEFT JOIN territories t ON t.region_id = r.id
    WHERE r.type = 'SERVICE_TERRITORY'
      AND t.region_id IS NULL
    ORDER BY r.eia_id
  `);

  const rows = missing.rows as Array<{
    region_id: string;
    eia_id: string | null;
    slug: string;
    name: string;
  }>;

  console.log(`   Found ${rows.length} regions missing geometry.\n`);

  if (rows.length === 0) {
    console.log("✅ Nothing to backfill. Exiting.");
    await pool.end();
    return;
  }

  let inserted = 0;
  let skippedNoFile = 0;
  let skippedNoFeatures = 0;
  let skippedInvalidJson = 0;
  let errored = 0;

  for (const row of rows) {
    const eiaId = row.eia_id;
    if (!eiaId) {
      console.warn(`  ⚠️  Skipping ${row.region_id}: no eia_id`);
      skippedNoFile++;
      continue;
    }

    const filePath = path.join(TERRITORY_DIR, `${eiaId}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️  Skipping ${row.region_id} (${row.name}): no file at ${filePath}`);
      skippedNoFile++;
      continue;
    }

    let geojson: {
      features: Array<{
        properties: Record<string, unknown>;
        geometry: Record<string, unknown>;
      }>;
    };
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      geojson = JSON.parse(raw);
    } catch {
      console.warn(`  ⚠️  Skipping ${row.region_id}: invalid JSON at ${filePath}`);
      skippedInvalidJson++;
      continue;
    }

    if (!geojson.features?.length) {
      console.warn(`  ⚠️  Skipping ${row.region_id}: no features in file`);
      skippedNoFeatures++;
      continue;
    }

    const feature = geojson.features[0];
    const fileRegionId = feature.properties?.id as string | undefined;
    if (fileRegionId && fileRegionId !== row.region_id) {
      console.warn(
        `  ⚠️  region_id mismatch for eiaId=${eiaId}: file says "${fileRegionId}" but DB says "${row.region_id}". Using DB region_id.`
      );
    }

    const geojsonStr = JSON.stringify(feature.geometry);
    const territoryId = `territory-${eiaId}`;

    try {
      // ST_MakeValid may return a GeometryCollection when fixing self-intersecting
      // polygons (small slivers of lines/points can leak in). ST_CollectionExtract(_, 3)
      // keeps only polygonal components, then ST_Multi normalizes Polygon → MultiPolygon
      // so the cast to geography(MultiPolygon) succeeds.
      const res = await db.execute(sql`
        INSERT INTO territories (id, region_id, geography, source, source_url)
        VALUES (
          ${territoryId},
          ${row.region_id},
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(ST_GeomFromGeoJSON(${geojsonStr})),
              3
            )
          )::geography,
          ${"HIFLD ArcGIS"},
          ${"https://hifld-geoplatform.opendata.arcgis.com/datasets/f4cd55044f8f4d04a2dd0f5f1e6f4b6e/"}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `);

      if ((res.rows as unknown[]).length > 0) {
        inserted++;
        console.log(`  ✅ ${eiaId.padEnd(6)} ${row.name} → ${territoryId}`);
      } else {
        console.log(`  ↪️  ${eiaId.padEnd(6)} ${row.name} → already present (conflict)`);
      }
    } catch (err) {
      console.error(`  ❌ ${eiaId} ${row.name}: ${(err as Error).message}`);
      errored++;
    }
  }

  console.log("\n──────────────────────────────────────────────");
  console.log(`  ✅ Inserted:           ${inserted}`);
  console.log(`  ⚠️  No file on disk:    ${skippedNoFile}`);
  console.log(`  ⚠️  Invalid JSON:       ${skippedInvalidJson}`);
  console.log(`  ⚠️  No features:        ${skippedNoFeatures}`);
  console.log(`  ❌ Errored:            ${errored}`);
  console.log("──────────────────────────────────────────────\n");

  // Post-flight: re-run the missing query to confirm we emptied it.
  const postCheck = await db.execute(sql`
    SELECT COUNT(*)::int AS remaining
    FROM regions r
    LEFT JOIN territories t ON t.region_id = r.id
    WHERE r.type = 'SERVICE_TERRITORY'
      AND t.region_id IS NULL
  `);
  const remaining = (postCheck.rows[0] as { remaining: number }).remaining;
  console.log(`📊 Remaining SERVICE_TERRITORY regions without geometry: ${remaining}`);

  await pool.end();

  if (errored > 0 || remaining > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
