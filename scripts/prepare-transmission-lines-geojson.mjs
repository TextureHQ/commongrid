/**
 * Prepares data/transmission-lines.geojson for tippecanoe tile generation.
 *
 * Reads the full GeoJSON saved by sync-transmission-lines.ts and writes a
 * cleaned .tmp file that tippecanoe will consume directly.
 *
 * Voltage class is written as a numeric value so tippecanoe can use it for
 * zoom-level filtering (--filter-lowest-zoom won't work on strings, but we
 * rely on tippecanoe options rather than property filtering here).
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const INPUT = join(DATA_DIR, "transmission-lines.geojson");
const OUTPUT = join(process.cwd(), ".tmp-transmission-lines.geojson");

async function main() {
  try {
    await access(INPUT);
  } catch {
    console.warn("⚠️  data/transmission-lines.geojson not found — skipping. Run npm run sync:transmission-lines first.");
    process.exit(0);
  }

  const raw = await readFile(INPUT, "utf-8");
  const fc = JSON.parse(raw);

  // Add a numeric voltageRank property for zoom-based filtering:
  //   4 = extra-high (345kV+) → show at all zooms
  //   3 = high (230–344kV)     → tippecanoe will drop some at low zoom
  //   2 = medium (115–229kV)   → drop more at low zoom
  //   1 = sub-trans (69–114kV) → drop most at low zoom
  //   0 = unknown
  const rankMap = { "extra-high": 4, high: 3, medium: 2, "sub-trans": 1, unknown: 0 };

  for (const feature of fc.features) {
    const vc = feature.properties.voltageClass ?? "unknown";
    feature.properties.voltageRank = rankMap[vc] ?? 0;
  }

  await writeFile(OUTPUT, JSON.stringify(fc));
  console.log(`✅ ${fc.features.length} transmission line features → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
