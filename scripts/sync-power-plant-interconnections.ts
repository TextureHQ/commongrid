/**
 * Sync script: Populate power_plant_interconnections join table.
 *
 * For each power plant, finds the nearest substation(s) using ST_Distance.
 * The closest match is marked as isPrimary=true.
 * Secondary candidates within a configurable radius (default: 50 km) are also stored.
 *
 * Usage:
 *   cd commongrid
 *   npx tsx scripts/sync-power-plant-interconnections.ts
 *
 * Environment variables:
 *   SEARCH_RADIUS_KM  — max distance to consider (default: 50)
 *
 * Output:
 *   - power_plant_interconnections table populated
 *   - logs: distribution of distances + primary/secondary counts
 *
 * References:
 *   • DB schema: lib/db/schema/power-plant-interconnections.ts
 *   • Research: memory/specs/ninth-entry-point-research.md
 */

import { neon } from "@neondatabase/serverless";
import type { PowerPlantInterconnectionInsert } from "../lib/db/schema/power-plant-interconnections";

interface DistanceResult {
  plant_id: string;
  substation_id: string;
  distance_meters: number;
  is_nearest: boolean;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set");
  }

  const sql = neon(databaseUrl);
  const timestamp = new Date().toISOString();
  const searchRadiusKm = parseInt(process.env.SEARCH_RADIUS_KM || "50", 10);
  const searchRadiusMeters = searchRadiusKm * 1000;

  console.log(`[${timestamp}] Starting power_plant_interconnections sync...`);
  console.log(`  Search radius: ${searchRadiusKm} km (${searchRadiusMeters} m)`);

  try {
    // 1. Use ST_Distance directly in the database to find nearest substations
    console.log(`[${timestamp}] Computing nearest substations for each power plant...`);

    const results = await sql<DistanceResult[]>`
      WITH plant_distances AS (
        SELECT
          pp.id as plant_id,
          s.id as substation_id,
          ST_Distance(
            ST_GeomFromGeoJSON(pp.lat_lon),
            ST_GeomFromGeoJSON(s.lat_lon)
          ) as distance_meters,
          ROW_NUMBER() OVER (PARTITION BY pp.id ORDER BY ST_Distance(
            ST_GeomFromGeoJSON(pp.lat_lon),
            ST_GeomFromGeoJSON(s.lat_lon)
          )) as rn
        FROM power_plants pp
        CROSS JOIN substations s
        WHERE
          pp.deleted_at IS NULL
          AND s.deleted_at IS NULL
          AND ST_Distance(
            ST_GeomFromGeoJSON(pp.lat_lon),
            ST_GeomFromGeoJSON(s.lat_lon)
          ) <= ${searchRadiusMeters}
      )
      SELECT
        plant_id,
        substation_id,
        distance_meters,
        (rn = 1) as is_nearest
      FROM plant_distances
      ORDER BY plant_id, distance_meters
    `;

    console.log(`[${timestamp}] Found ${results.length} potential interconnections`);

    // 2. Prepare inserts
    const inserts: PowerPlantInterconnectionInsert[] = results.map((row) => ({
      powerPlantId: row.plant_id,
      substationId: row.substation_id,
      distanceMeters: row.distance_meters,
      isPrimary: row.is_nearest,
    }));

    // 3. Clear existing (for re-runs)
    console.log(`[${timestamp}] Clearing existing interconnections...`);
    await sql`TRUNCATE TABLE power_plant_interconnections`;

    // 4. Batch insert
    if (inserts.length > 0) {
      console.log(`[${timestamp}] Inserting ${inserts.length} interconnections...`);

      const batchSize = 100;
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize);
        const values = batch
          .map(
            (insert) =>
              `('${insert.powerPlantId}', '${insert.substationId}', ${insert.distanceMeters}, ${insert.isPrimary})`
          )
          .join(",");

        await sql`
          INSERT INTO power_plant_interconnections
            (power_plant_id, substation_id, distance_meters, is_primary)
          VALUES ${sql.raw(values)}
          ON CONFLICT (power_plant_id, substation_id) DO UPDATE SET
            distance_meters = EXCLUDED.distance_meters,
            is_primary = EXCLUDED.is_primary
        `;
      }
    }

    // 5. Stats
    const primaryCount = inserts.filter((i) => i.isPrimary).length;
    const secondaryCount = inserts.length - primaryCount;
    const avgDistance = inserts.length > 0 ? inserts.reduce((sum, i) => sum + i.distanceMeters, 0) / inserts.length : 0;

    console.log(`[${timestamp}] Sync complete.`);
    console.log(`  Total interconnections: ${inserts.length}`);
    console.log(`  Primary (nearest): ${primaryCount}`);
    console.log(`  Secondary (within ${searchRadiusKm}km): ${secondaryCount}`);
    console.log(`  Average distance: ${(avgDistance / 1000).toFixed(2)} km`);
  } catch (err) {
    console.error(`[${timestamp}] Sync failed:`, err);
    process.exit(1);
  }
}

main().catch(console.error);
