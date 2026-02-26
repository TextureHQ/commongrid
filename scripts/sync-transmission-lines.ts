/**
 * Sync script: Download HIFLD Electric Power Transmission Lines.
 *
 * Fetches all US transmission line features (69kV–765kV) from the
 * HIFLD ArcGIS Feature Service and saves:
 *   - data/transmission-lines.json    — lightweight metadata array for list/search
 *   - data/transmission-lines.geojson — full GeoJSON FeatureCollection for tippecanoe
 *
 * Usage:
 *   cd opengrid
 *   npx tsx scripts/sync-transmission-lines.ts
 *
 * Output:
 *   data/transmission-lines.json
 *   data/transmission-lines.geojson
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { TransmissionLine, VoltageClass } from "../types/transmission-lines";

const BASE_URL =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";

const DATA_DIR = path.join(process.cwd(), "data");
const BATCH_SIZE = 1000;

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
    outFields: "OBJECTID_1,OBJECTID,ID,TYPE,STATUS,NAICS_CODE,SOURCE,OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,SHAPE__Len,Shape__Length",
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

/** Convert Shape__Length (degrees, roughly) to miles. Very rough approximation. */
function shapelenToMiles(shapeLen: number | undefined): number {
  if (!shapeLen) return 0;
  // Shape__Length is in the coordinate reference system units.
  // For GCS (lat/lon), it's in decimal degrees — 1 degree ≈ 69 miles.
  // For projected (meters), divide by 1609.34.
  // HIFLD data uses geographic coords (degrees), so multiply by 69.
  return Math.round(shapeLen * 69 * 100) / 100;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔌 Syncing HIFLD transmission lines…");

  const allMetadata: TransmissionLine[] = [];
  const allFeatures: object[] = [];
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
      const lengthMiles = shapelenToMiles(p.Shape__Length ?? p.SHAPE__Len);

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

      // GeoJSON feature for tippecanoe
      allFeatures.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          objectId,
          id: meta.id,
          voltage,
          voltageClass,
          owner: meta.owner,
          status: meta.status,
          type: meta.type,
          lengthMiles,
        },
      });
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

  // Write metadata JSON
  const metaPath = path.join(DATA_DIR, "transmission-lines.json");
  fs.writeFileSync(metaPath, JSON.stringify(allMetadata, null, 2));
  const metaSize = (fs.statSync(metaPath).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Wrote ${metaPath} (${metaSize} MB)`);

  // Write GeoJSON FeatureCollection
  const geojson = {
    type: "FeatureCollection",
    features: allFeatures,
  };
  const geojsonPath = path.join(DATA_DIR, "transmission-lines.geojson");
  fs.writeFileSync(geojsonPath, JSON.stringify(geojson));
  const geojsonSize = (fs.statSync(geojsonPath).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Wrote ${geojsonPath} (${geojsonSize} MB)`);

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
