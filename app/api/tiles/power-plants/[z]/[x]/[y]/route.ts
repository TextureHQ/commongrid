import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import geojsonvt from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";

interface PlantProperties {
  slug: string;
  name: string;
  fuelCategory: string;
  capacityMw: number;
  status: string;
}

interface PowerPlantRecord {
  slug: string;
  name: string;
  fuelCategory: string;
  totalCapacityMw: number;
  proposedCapacityMw: number | null;
  status: string;
  latitude: number;
  longitude: number;
}

let tileIndexPromise: Promise<ReturnType<typeof geojsonvt>> | null = null;

async function buildTileIndex(): Promise<ReturnType<typeof geojsonvt>> {
  const raw = await readFile(join(process.cwd(), "data/power-plants.json"), "utf-8");
  const plants: PowerPlantRecord[] = JSON.parse(raw);

  const features: Feature<Geometry, PlantProperties>[] = [];

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

  const fc: FeatureCollection<Geometry, PlantProperties> = {
    type: "FeatureCollection",
    features,
  };

  return geojsonvt(fc, {
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

  const layers = { "power-plants": tile };
  const mvtBuffer = fromGeojsonVt(layers);
  const buffer = Buffer.from(mvtBuffer);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
