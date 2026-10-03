import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const spatialLayers = [
  "utilities", "territories", "ev-stations", "power-plants", "pricing-nodes",
  "transmission-lines", "substations", "balancing-authorities", "isos", "rtos",
];

function position(value) {
  if (!Array.isArray(value) || value.length < 2 || !value.every(Number.isFinite)
    || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
    throw new Error("Invalid WGS84 position");
  }
}

function line(value, ring = false) {
  if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) throw new Error("Invalid line/ring");
  value.forEach(position);
  if (ring && JSON.stringify(value[0]) !== JSON.stringify(value.at(-1))) throw new Error("Unclosed ring");
}

function polygon(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Empty polygon");
  value.forEach((ring) => line(ring, true));
}

export function validateGeoJSON(value) {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features) || !value.features.length) {
    throw new Error("Expected a non-empty FeatureCollection");
  }
  for (const feature of value.features) {
    if (feature?.type !== "Feature" || !feature.properties?.id || !feature.geometry) {
      throw new Error("Feature requires a public ID, properties and geometry");
    }
    const { type, coordinates } = feature.geometry;
    switch (type) {
      case "Point": position(coordinates); break;
      case "LineString": line(coordinates); break;
      case "Polygon": polygon(coordinates); break;
      case "MultiLineString":
      case "MultiPolygon":
        if (!Array.isArray(coordinates) || !coordinates.length) throw new Error("Empty multi-geometry");
        coordinates.forEach(type === "MultiPolygon" ? polygon : (item) => line(item));
        break;
      default: throw new Error(`Unsupported geometry: ${type}`);
    }
  }
  return value.features.length;
}

export function validateSnapshot(directory) {
  const files = readdirSync(directory);
  const expected = [...spatialLayers.map((name) => `${name}.geojson.gz`), "programs.json.gz", "rates.json.gz"];
  for (const name of expected) {
    if (!files.includes(name)) throw new Error(`Missing artifact: ${name}`);
    const value = JSON.parse(gunzipSync(readFileSync(join(directory, name))).toString("utf8"));
    if (name.endsWith(".geojson.gz")) {
      console.log(`${name}: ${validateGeoJSON(value)} features`);
    } else {
      if (!Array.isArray(value) || !value.length || value.some((row) => !row?.id)) {
        throw new Error(`${name}: expected non-empty records with public IDs`);
      }
      console.log(`${name}: ${value.length} records`);
    }
  }
  const sqlFiles = files.filter((name) => /^commongrid-\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(name));
  if (sqlFiles.length !== 1) throw new Error("Expected exactly one dated SQL dump");
  const sql = gunzipSync(readFileSync(join(directory, sqlFiles[0]))).toString("utf8");
  if (!sql.includes("PostgreSQL database dump") || !sql.includes("COPY public.utilities")) {
    throw new Error("Invalid or empty SQL dump");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/validate-snapshot.mjs <directory>");
  validateSnapshot(process.argv[2]);
}
