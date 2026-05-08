/**
 * GET /api/tiles/substations/:z/:x/:y
 *
 * Vector tile endpoint for substations layer.
 * Serves Mapbox Vector Tile format (.pbf) for map rendering.
 *
 * Notes:
 * - Tiles are generated from substations.geojson via tippecanoe
 * - Cached at long TTL (1 week) since source data updates weekly
 * - Future: regenerate tiles on sync completion via CI
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ z: string; x: string; y: string }>;
  }
) {
  const { z, x, y } = await params;

  try {
    // Construct path to pre-generated tiles
    // Expected: public/tiles/substations/{z}/{x}/{y}.pbf
    const tilePath = join(process.cwd(), "public", "tiles", "substations", z, x, `${y}.pbf`);

    const tileData = await readFile(tilePath);

    return new Response(tileData, {
      status: 200,
      headers: {
        "Content-Type": "application/x-protobuf",
        "Content-Encoding": "gzip",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400", // 1 week
        "Cache-Tag": `tiles:substations`,
        // Allow CORS for map clients
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      },
    });
  } catch (_error) {
    // Tile not found or reading failed
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "public, s-maxage=300", // Cache 404s briefly
      },
    });
  }
}

export async function HEAD(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ z: string; x: string; y: string }>;
  }
) {
  const { z, x, y } = await params;

  try {
    const tilePath = join(process.cwd(), "public", "tiles", "substations", z, x, `${y}.pbf`);
    await readFile(tilePath);

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/x-protobuf",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
