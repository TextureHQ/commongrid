/**
 * Converts pricing-nodes.json into a GeoJSON FeatureCollection for tippecanoe.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const OUTPUT = join(process.cwd(), ".tmp-pricing-nodes.geojson");

async function main() {
  const raw = await readFile(join(DATA_DIR, "pricing-nodes.json"), "utf-8");
  const nodes = JSON.parse(raw);

  const features = [];
  for (const n of nodes) {
    if (n.latitude == null || n.longitude == null) continue;
    features.push({
      type: "Feature",
      properties: {
        slug: n.slug,
        name: n.name,
        iso: n.iso,
        nodeType: n.nodeType,
        zone: n.zone ?? "",
        state: n.state ?? "",
      },
      geometry: {
        type: "Point",
        coordinates: [n.longitude, n.latitude],
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} pricing node features → ${OUTPUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
