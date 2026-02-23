/**
 * Pre-generates static vector tiles (MVT/PBF) for power plant points.
 *
 * Reads data/power-plants.json, builds a GeoJSON FeatureCollection of Point
 * features, creates a geojson-vt index, and writes tiles to
 * public/tiles/power-plants/{z}/{x}/{y}.pbf for zoom 0–12.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const { fromGeojsonVt } = vtpbf;

const MAX_ZOOM = 12;
const DATA_DIR = join(process.cwd(), "data");
const OUT_DIR = join(process.cwd(), "public", "tiles", "power-plants");

async function buildFeatureCollection() {
  const raw = await readFile(join(DATA_DIR, "power-plants.json"), "utf-8");
  const plants = JSON.parse(raw);

  const features = [];

  for (const plant of plants) {
    if (plant.latitude == null || plant.longitude == null) continue;

    features.push({
      type: "Feature",
      properties: {
        slug: plant.slug,
        name: plant.name,
        fuelCategory: plant.fuelCategory,
        capacityMw: plant.status === "operable" ? plant.totalCapacityMw : (plant.proposedCapacityMw ?? 0),
        status: plant.status,
      },
      geometry: {
        type: "Point",
        coordinates: [plant.longitude, plant.latitude],
      },
    });
  }

  console.log(`✅ Loaded ${features.length} power plant features`);

  return {
    type: "FeatureCollection",
    features,
  };
}

async function generateTiles() {
  const fc = await buildFeatureCollection();

  console.log("Building geojson-vt index for power plants...");
  const index = geojsonvt(fc, {
    maxZoom: 14,
    tolerance: 3,
    extent: 4096,
    buffer: 64,
    indexMaxZoom: 5,
    indexMaxPoints: 100000,
  });

  let totalTiles = 0;

  for (let z = 0; z <= MAX_ZOOM; z++) {
    const maxCoord = 1 << z;
    let zoomTiles = 0;

    for (let x = 0; x < maxCoord; x++) {
      for (let y = 0; y < maxCoord; y++) {
        const tile = index.getTile(z, x, y);
        if (!tile || !tile.features || tile.features.length === 0) continue;

        const layers = { "power-plants": tile };
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

  console.log(`✅ Generated ${totalTiles} total power plant tiles in public/tiles/power-plants/`);
}

generateTiles().catch((err) => {
  console.error("Power plant tile generation failed:", err);
  process.exit(1);
});
