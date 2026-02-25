/**
 * Combines all territory GeoJSON files into a single FeatureCollection
 * with utility properties attached. Output is used by tippecanoe.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const TERRITORIES_DIR = join(DATA_DIR, "territories");
const OUTPUT = join(process.cwd(), ".tmp-territories.geojson");

async function main() {
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
        customerCount: utility.customerCount ?? 0,
      };

      for (const feature of geojson.features) {
        allFeatures.push({
          type: "Feature",
          properties,
          geometry: feature.geometry,
        });
      }
    } catch {
      // Skip malformed files
    }
  }

  const fc = { type: "FeatureCollection", features: allFeatures };
  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ Combined ${allFeatures.length} territory features from ${files.length} files → ${OUTPUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
