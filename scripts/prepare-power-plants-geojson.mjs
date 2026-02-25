/**
 * Converts power-plants.json into a GeoJSON FeatureCollection for tippecanoe.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const OUTPUT = join(process.cwd(), ".tmp-power-plants.geojson");

async function main() {
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

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} power plant features → ${OUTPUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
