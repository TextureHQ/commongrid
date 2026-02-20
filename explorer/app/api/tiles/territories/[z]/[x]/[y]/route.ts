import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import geojsonvt from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";

const gzipAsync = promisify(gzip);

interface TerritoryProperties {
  name: string;
  eiaId: string;
  slug: string;
  segment: string;
  state: string | null;
}

interface RegionRecord {
  id: string;
  slug: string;
  eiaId: string | null;
  [key: string]: unknown;
}

interface UtilityRecord {
  name: string;
  slug: string;
  eiaId: string | null;
  segment: string;
  serviceTerritoryId: string | null;
  [key: string]: unknown;
}

let tileIndexPromise: Promise<ReturnType<typeof geojsonvt>> | null = null;

async function buildTileIndex(): Promise<ReturnType<typeof geojsonvt>> {
  const [regionsRaw, utilitiesRaw] = await Promise.all([
    readFile(join(process.cwd(), "data/regions.json"), "utf-8"),
    readFile(join(process.cwd(), "data/utilities.json"), "utf-8"),
  ]);
  const regions: RegionRecord[] = JSON.parse(regionsRaw);
  const utilities: UtilityRecord[] = JSON.parse(utilitiesRaw);

  const territoriesDir = join(process.cwd(), "public", "data", "territories");
  const files = (await readdir(territoriesDir)).filter((f) => f.endsWith(".json"));

  const regionsByEiaId = new Map<string, RegionRecord>();
  const regionsBySlug = new Map<string, RegionRecord>();
  for (const region of regions) {
    if (region.eiaId) regionsByEiaId.set(region.eiaId, region);
    regionsBySlug.set(region.slug, region);
  }

  const utilitiesByServiceTerritoryId = new Map<string, UtilityRecord>();
  for (const utility of utilities) {
    if (utility.serviceTerritoryId) {
      utilitiesByServiceTerritoryId.set(utility.serviceTerritoryId, utility);
    }
  }

  const allFeatures: Feature<Geometry, TerritoryProperties>[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(join(territoriesDir, file), "utf-8");
      const geojson: FeatureCollection = JSON.parse(raw);

      const fileKey = file.replace(".json", "");

      let region: RegionRecord | undefined = regionsByEiaId.get(fileKey);
      if (!region) region = regionsBySlug.get(fileKey);

      const utility = region ? utilitiesByServiceTerritoryId.get(region.id) : undefined;

      if (!utility) continue;

      const properties: TerritoryProperties = {
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
      // Malformed territory files are expected and safe to skip
    }
  }

  const merged: FeatureCollection<Geometry, TerritoryProperties> = {
    type: "FeatureCollection",
    features: allFeatures,
  };

  return geojsonvt(merged, {
    maxZoom: 14,
    tolerance: 3,
    extent: 4096,
    buffer: 64,
  });
}

function getTileIndex(): Promise<ReturnType<typeof geojsonvt>> {
  if (!tileIndexPromise) {
    tileIndexPromise = buildTileIndex();
  }
  return tileIndexPromise;
}

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y: yRaw } = await params;
  const yClean = yRaw.replace(/\.mvt$/, "");

  const zNum = Number.parseInt(z, 10);
  const xNum = Number.parseInt(x, 10);
  const yNum = Number.parseInt(yClean, 10);

  if (Number.isNaN(zNum) || Number.isNaN(xNum) || Number.isNaN(yNum)) {
    return new Response("Invalid tile coordinates", { status: 400 });
  }

  const index = await getTileIndex();
  const tile = index.getTile(zNum, xNum, yNum);

  if (!tile || !tile.features || tile.features.length === 0) {
    return new Response(null, { status: 204 });
  }

  const layers = { territories: tile };
  const mvtBuffer = fromGeojsonVt(layers);
  const buffer = Buffer.from(mvtBuffer);
  const compressed = await gzipAsync(buffer);

  return new Response(compressed, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Content-Encoding": "gzip",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
