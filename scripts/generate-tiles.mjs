/**
 * Pre-generates static vector tiles (MVT/PBF) at build time.
 *
 * Reads territory GeoJSON + regions + utilities, builds a geojson-vt index
 * (same logic as the API route), and writes gzipped .pbf tiles for zoom 0–10
 * into public/tiles/{z}/{x}/{y}.pbf.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const gzipAsync = promisify(gzip);
const { fromGeojsonVt } = vtpbf;

const MAX_ZOOM = 10;
const DATA_DIR = join(process.cwd(), "data");
const TERRITORIES_DIR = join(DATA_DIR, "territories");
const OUT_DIR = join(process.cwd(), "public", "tiles");

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
      };

      for (const feature of geojson.features) {
        allFeatures.push({
          type: "Feature",
          properties,
          geometry: feature.geometry,
        });
      }
    } catch {
      // Malformed territory files — safe to skip
    }
  }

  console.log(`✅ Loaded ${allFeatures.length} features from ${files.length} territory files`);

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

  for (let z = 0; z <= MAX_ZOOM; z++) {
    const maxCoord = 1 << z; // 2^z
    let zoomTiles = 0;

    for (let x = 0; x < maxCoord; x++) {
      for (let y = 0; y < maxCoord; y++) {
        const tile = index.getTile(z, x, y);
        if (!tile || !tile.features || tile.features.length === 0) continue;

        const layers = { territories: tile };
        const mvtBuffer = fromGeojsonVt(layers);
        const buffer = Buffer.from(mvtBuffer);
        const compressed = await gzipAsync(buffer);

        const dir = join(OUT_DIR, String(z), String(x));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${y}.pbf`), compressed);
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
