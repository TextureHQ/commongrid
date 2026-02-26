/**
 * Converts ev-charging.json into a GeoJSON FeatureCollection for tippecanoe.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const OUTPUT = join(process.cwd(), ".tmp-ev-charging.geojson");

async function main() {
  const raw = await readFile(join(DATA_DIR, "ev-charging.json"), "utf-8");
  const stations = JSON.parse(raw);

  const features = [];
  for (const s of stations) {
    if (s.latitude == null || s.longitude == null) continue;
    features.push({
      type: "Feature",
      properties: {
        slug: s.slug,
        name: s.stationName,
        network: s.evNetwork ?? "Non-Networked",
        dcFastCount: s.evDcFastNum ?? 0,
        level2Count: s.evLevel2EvseNum ?? 0,
        level1Count: s.evLevel1EvseNum ?? 0,
        accessCode: s.accessCode,
        status: s.statusCode,
        facilityType: s.facilityType ?? "",
      },
      geometry: {
        type: "Point",
        coordinates: [s.longitude, s.latitude],
      },
    });
  }

  const fc = { type: "FeatureCollection", features };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${features.length} EV charging features → ${OUTPUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
