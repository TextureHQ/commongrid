/**
 * Pre-generates static vector tiles (MVT/PBF) at build time.
 *
 * Reads territory GeoJSON + regions + utilities, pre-simplifies the geometry
 * using @turf/simplify to reduce vertex count (~2.5M → ~100-200K), then builds
 * a geojson-vt index and writes .pbf tiles for zoom 5–10.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import simplify from "@turf/simplify";

const { fromGeojsonVt } = vtpbf;

const MIN_ZOOM = 5;
const MAX_ZOOM = 10;
const DATA_DIR = join(process.cwd(), "data");
const TERRITORIES_DIR = join(DATA_DIR, "territories");
const OUT_DIR = join(process.cwd(), "public", "tiles");

// Simplification tolerance in degrees (~0.05° ≈ 5.5km)
// Aggressively reduces vertex count for tile rendering.
// At zoom 5-10, territories look clean — exact boundaries aren't needed for the overview.
// Detail panels load the original full-resolution GeoJSON when you click into a utility.
const SIMPLIFY_TOLERANCE = 0.05;

function countVertices(geometry) {
  const coords = JSON.stringify(geometry.coordinates || []);
  return (coords.match(/\[[\d.-]+,[\d.-]+\]/g) || []).length;
}

async function buildFeatureCollection() {
  const [regionsRaw, utilitiesRaw] = await Promise.all([
    readFile(join(DATA_DIR, "regions.json"), "utf-8"),
    readFile(join(DATA_DIR, "utilities.json"), "utf-8"),
  ]);
  const regions = JSON.parse(regionsRaw);
  const utilities = JSON.parse(utilitiesRaw);

  const regionsByEiaId = new Map();
  const regionsBySlug = new Map();
  for (const region of regions) {
    if (region.eiaId) regionsByEiaId.set(region.eiaId, region);
    regionsBySlug.set(region.slug, region);
  }

  const utilitiesByServiceTerritoryId = new Map();
  for (const utility of utilities) {
    if (utility.serviceTerritoryId) {
      utilitiesByServiceTerritoryId.set(utility.serviceTerritoryId, utility);
    }
  }

  const files = (await readdir(TERRITORIES_DIR)).filter((f) => f.endsWith(".json"));
  const allFeatures = [];
  let totalVertsBefore = 0;
  let totalVertsAfter = 0;

  for (const file of files) {
    try {
      const raw = await readFile(join(TERRITORIES_DIR, file), "utf-8");
      const geojson = JSON.parse(raw);
      const fileKey = file.replace(".json", "");

      let region = regionsByEiaId.get(fileKey);
      if (!region) region = regionsBySlug.get(fileKey);

      const utility = region ? utilitiesByServiceTerritoryId.get(region.id) : undefined;
      if (!utility) continue;

      const properties = {
        name: utility.name,
        eiaId: utility.eiaId ?? fileKey,
        slug: utility.slug,
        segment: utility.segment,
        state: geojson.features[0]?.properties?.state ?? null,
        customerCount: utility.customerCount ?? 0,
      };

      for (const feature of geojson.features) {
        const vertsBefore = countVertices(feature.geometry);
        totalVertsBefore += vertsBefore;

        // Pre-simplify complex geometries using Douglas-Peucker
        let geometry = feature.geometry;
        if (vertsBefore > 50) {
          try {
            const simplified = simplify(
              { type: "Feature", properties: {}, geometry },
              { tolerance: SIMPLIFY_TOLERANCE, highQuality: true, mutate: false }
            );
            geometry = simplified.geometry;
          } catch {
            // Keep original if simplification fails
          }
        }

        const vertsAfter = countVertices(geometry);
        totalVertsAfter += vertsAfter;

        allFeatures.push({
          type: "Feature",
          properties,
          geometry,
        });
      }
    } catch {
      // Malformed territory files — safe to skip
    }
  }

  const reduction = ((1 - totalVertsAfter / totalVertsBefore) * 100).toFixed(1);
  console.log(`✅ Loaded ${allFeatures.length} features from ${files.length} territory files`);
  console.log(`   Vertices: ${totalVertsBefore.toLocaleString()} → ${totalVertsAfter.toLocaleString()} (${reduction}% reduction)`);

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
}

async function generateTiles() {
  const fc = await buildFeatureCollection();

  console.log("Building geojson-vt index...");
  const index = geojsonvt(fc, {
    maxZoom: 14,
    tolerance: 3,
    extent: 4096,
    buffer: 64,
  });

  let totalTiles = 0;

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const maxCoord = 1 << z; // 2^z
    let zoomTiles = 0;

    for (let x = 0; x < maxCoord; x++) {
      for (let y = 0; y < maxCoord; y++) {
        const tile = index.getTile(z, x, y);
        if (!tile || !tile.features || tile.features.length === 0) continue;

        const layers = { territories: tile };
        const mvtBuffer = fromGeojsonVt(layers);
        const buffer = Buffer.from(mvtBuffer);

        const dir = join(OUT_DIR, String(z), String(x));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${y}.pbf`), buffer);
        zoomTiles++;
      }
    }

    totalTiles += zoomTiles;
    console.log(`  Zoom ${z}: ${zoomTiles} tiles generated`);
  }

  console.log(`✅ Generated ${totalTiles} total tiles in public/tiles/`);
}

generateTiles().catch((err) => {
  console.error("Tile generation failed:", err);
  process.exit(1);
});
