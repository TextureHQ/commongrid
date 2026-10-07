/**
 * Sync script: Download HIFLD Electric Power Transmission Lines.
 *
 * Fetches all US transmission line features (69kV–765kV) from the
 * HIFLD ArcGIS Feature Service and upserts them directly into the
 * `transmission_lines` Postgres table (CG-327/CG-328). The committed
 * data/transmission-lines.json and data/transmission-lines.geojson artifacts
 * are no longer produced — the app, tile build (prepare-transmission-lines-
 * geojson.mjs) and seed all read from Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/sync-transmission-lines.ts
 *
 * Output:
 *   Upserts into the `transmission_lines` Postgres table.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { transmissionLines } from "../lib/db/schema";
import type { TransmissionLine, VoltageClass } from "../types/transmission-lines";

const BASE_URL =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";

const DATA_DIR = path.join(process.cwd(), "data");
const BATCH_SIZE = 1000;
/** DB upsert batch size (rows per INSERT ... ON CONFLICT statement). */
const DB_BATCH_SIZE = 500;

/**
 * Guards against replacing a healthy dataset with a degraded API response.
 * HIFLD returns ~90k US transmission-line segments; a plausible sync should be
 * well above this floor.
 */
const MIN_EXPECTED_LINES = 20_000;

/**
 * Guards against replacing a healthy dataset with a degraded API response.
 * Throws when the incoming count is implausibly small, or when it collapses to
 * under half of what is already in the transmission_lines table.
 */
export function assertPlausibleLineCount(incoming: number, existing: number | null): void {
  if (incoming < MIN_EXPECTED_LINES) {
    throw new Error(
      `Upstream returned only ${incoming} usable transmission lines, below the ${MIN_EXPECTED_LINES} minimum. ` +
        "Refusing to overwrite the transmission_lines table with a likely-degraded response."
    );
  }
  if (existing !== null && existing > 0 && incoming < existing / 2) {
    throw new Error(
      `Upstream returned ${incoming} transmission lines but ${existing} are already in the table — a >50% drop. ` +
        "Refusing to overwrite; re-run or investigate upstream before committing."
    );
  }
}

// ── Voltage classification ──────────────────────────────────────────────────

function classifyVoltage(voltage: number | null): VoltageClass {
  if (voltage == null || voltage <= 0) return "unknown";
  if (voltage >= 345) return "extra-high";
  if (voltage >= 230) return "high";
  if (voltage >= 115) return "medium";
  if (voltage >= 69) return "sub-trans";
  return "unknown";
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

interface ArcGISFeature {
  type: "Feature";
  id: number;
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
  properties: {
    OBJECTID_1?: number;
    OBJECTID?: number;
    ID?: string;
    TYPE?: string;
    STATUS?: string;
    NAICS_CODE?: string;
    SOURCE?: string;
    OWNER?: string;
    VOLTAGE?: number | null;
    VOLT_CLASS?: string;
    SUB_1?: string;
    SUB_2?: string;
    SHAPE__Len?: number;
    Shape__Length?: number;
    [key: string]: unknown;
  };
}

interface ArcGISResponse {
  type: "FeatureCollection";
  properties?: { exceededTransferLimit?: boolean };
  features: ArcGISFeature[];
}

async function fetchBatch(offset: number): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields:
      "OBJECTID_1,OBJECTID,ID,TYPE,STATUS,NAICS_CODE,SOURCE,OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,SHAPE__Len,Shape__Length",
    f: "geojson",
    resultRecordCount: String(BATCH_SIZE),
    resultOffset: String(offset),
    orderByFields: "OBJECTID",
  });

  const url = `${BASE_URL}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at offset ${offset}: ${await res.text()}`);
  }
  return res.json() as Promise<ArcGISResponse>;
}

// ── Conversion helpers ──────────────────────────────────────────────────────

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔌 Syncing HIFLD transmission lines…");

  // 0. Require DATABASE_URL up front
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required — the transmission-lines sync writes directly to Postgres");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const allMetadata: TransmissionLine[] = [];
  /** Parallel array of GeoJSON geometry (LineString/MultiLineString) per metadata row, by index. */
  const allGeometries: (object | null)[] = [];
  let offset = 0;
  let batch = 0;

  while (true) {
    batch++;
    process.stdout.write(`  Batch ${batch}: offset ${offset}…`);
    const response = await fetchBatch(offset);

    const { features } = response;
    const exceeded = response.properties?.exceededTransferLimit ?? false;

    process.stdout.write(` ${features.length} features\n`);

    for (const f of features) {
      const p = f.properties;
      const objectId = p.OBJECTID_1 ?? p.OBJECTID ?? f.id ?? 0;
      const voltage = typeof p.VOLTAGE === "number" ? p.VOLTAGE : null;
      const voltageClass = classifyVoltage(voltage);
      const lengthMiles = null; // Computed from WGS84 geometry in the SQL below.

      // Metadata for list page
      const meta: TransmissionLine = {
        objectId,
        id: p.ID ?? String(objectId),
        type: p.TYPE ?? "",
        status: p.STATUS ?? "",
        owner: p.OWNER ?? "",
        voltage,
        voltClass: p.VOLT_CLASS ?? "",
        voltageClass,
        sub1: p.SUB_1 ?? "",
        sub2: p.SUB_2 ?? "",
        lengthMiles,
        naicsCode: p.NAICS_CODE ?? "",
        source: p.SOURCE ?? "",
      };
      allMetadata.push(meta);
      allGeometries.push(f.geometry ?? null);
    }

    if (!exceeded || features.length < BATCH_SIZE) {
      console.log(`  ✅ Done — all features fetched.`);
      break;
    }

    offset += features.length;

    // Polite delay between batches
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n📊 Total features: ${allMetadata.length}`);

  // Plausibility guard against a degraded upstream response
  const existingCountResult = await db.execute(
    sql`SELECT COUNT(*) AS count FROM transmission_lines WHERE deleted_at IS NULL`
  );
  const existingCount = Number(existingCountResult.rows[0].count);
  console.log(`   Existing transmission_lines count: ${existingCount.toLocaleString()}`);
  assertPlausibleLineCount(allMetadata.length, existingCount);

  // Deduplicate by primary key before upserting. HIFLD occasionally emits
  // duplicate or blank `ID` values; a single INSERT ... ON CONFLICT (id) DO
  // UPDATE statement aborts with "ON CONFLICT DO UPDATE command cannot affect
  // row a second time" if the same conflict target appears twice in one
  // statement. Keep the last occurrence per id and drop rows with a blank id
  // (which cannot be a stable primary key). We pair metadata with its geometry
  // by index first so both stay aligned through the de-dupe.
  const dedupedById = new Map<string, { meta: TransmissionLine; geom: object | null }>();
  let blankIdDropped = 0;
  let duplicateIdDropped = 0;
  for (let k = 0; k < allMetadata.length; k++) {
    const meta = allMetadata[k];
    const id = (meta.id ?? "").trim();
    if (!id) {
      blankIdDropped++;
      continue;
    }
    if (dedupedById.has(id)) duplicateIdDropped++;
    dedupedById.set(id, { meta: { ...meta, id }, geom: allGeometries[k] ?? null });
  }
  if (blankIdDropped > 0 || duplicateIdDropped > 0) {
    console.log(
      `   De-duped upstream rows: dropped ${blankIdDropped.toLocaleString()} blank-id and ${duplicateIdDropped.toLocaleString()} duplicate-id rows`
    );
  }
  const dedupedRows = Array.from(dedupedById.values());

  // Upsert to Postgres, including PostGIS geometry (the single source of truth
  // for tile generation — CG-328). Geometry must go through ST_GeomFromGeoJSON,
  // so we build a parameterized multi-row INSERT rather than drizzle .values().
  console.log("\n🔄 Syncing to Postgres…");
  let upserted = 0;
  let skippedGeom = 0;
  for (let i = 0; i < dedupedRows.length; i += DB_BATCH_SIZE) {
    const sliceRows = dedupedRows.slice(i, i + DB_BATCH_SIZE);
    const sliceMeta = sliceRows.map((r) => r.meta);
    const sliceGeom = sliceRows.map((r) => r.geom);

    // Build VALUES tuples. Each row's geometry is normalized to MultiLineString
    // via ST_Multi(ST_CollectionExtract(ST_MakeValid(...), 2)) — 2 keeps only
    // (multi)linestring components so the cast succeeds even if MakeValid emits
    // a GeometryCollection. NULL geometry rows are inserted with NULL geometry.
    const valueTuples = sliceMeta.map((m, j) => {
      const g = sliceGeom[j];
      const geomExpr =
        g == null
          ? sql`NULL`
          : sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(
              g
            )}), 4326)), 2))`;
      if (g == null) skippedGeom++;
      return sql`(${m.id}, ${m.objectId}, ${m.type}, ${m.status}, ${m.owner}, ${m.voltage}, ${m.voltClass}, ${m.voltageClass}, ${m.sub1}, ${m.sub2}, ${sql`CASE WHEN ${geomExpr} IS NULL OR ST_IsEmpty(${geomExpr}) THEN NULL ELSE ST_Length(${geomExpr}::geography, false) / 1609.344 END`}, ${m.naicsCode}, ${m.source || "HIFLD"}, ${geomExpr})`;
    });

    await db.execute(sql`
      INSERT INTO transmission_lines
        (id, object_id, type, status, owner, voltage, volt_class, voltage_class, sub1, sub2, length_miles, naics_code, source, geometry)
      VALUES ${sql.join(valueTuples, sql`, `)}
      ON CONFLICT (id) DO UPDATE SET
        object_id = EXCLUDED.object_id,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        owner = EXCLUDED.owner,
        voltage = EXCLUDED.voltage,
        volt_class = EXCLUDED.volt_class,
        voltage_class = EXCLUDED.voltage_class,
        sub1 = EXCLUDED.sub1,
        sub2 = EXCLUDED.sub2,
        length_miles = EXCLUDED.length_miles,
        naics_code = EXCLUDED.naics_code,
        source = EXCLUDED.source,
        geometry = EXCLUDED.geometry,
        updated_at = NOW()
    `);

    upserted += sliceMeta.length;
    if (upserted % (DB_BATCH_SIZE * 10) === 0 || upserted === dedupedRows.length) {
      console.log(`   Processed ${upserted.toLocaleString()} / ${dedupedRows.length.toLocaleString()} lines…`);
    }
  }
  console.log(`   ✓ Upserted ${upserted.toLocaleString()} transmission lines to Postgres`);
  if (skippedGeom > 0) {
    console.warn(`   ⚠️  ${skippedGeom.toLocaleString()} rows had no geometry (inserted with NULL geometry).`);
  }
  await pool.end();

  // Voltage breakdown summary
  const byClass: Record<string, number> = {};
  for (const m of allMetadata) {
    byClass[m.voltageClass] = (byClass[m.voltageClass] ?? 0) + 1;
  }
  console.log("\n📈 By voltage class:");
  for (const [cls, count] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cls}: ${count.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
