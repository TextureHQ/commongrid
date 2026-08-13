/**
 * GET /api/tiles/{layer}.json
 *
 * TileJSON 3.0.0 document for a single vector tile layer, so any Mapbox GL JS
 * or MapLibre GL JS client can add the layer with one URL:
 *
 *   map.addSource("cg-plants", {
 *     type: "vector",
 *     url: "https://commongrid.info/api/tiles/power-plants.json",
 *   });
 *
 * This route is a dynamic sibling of the per-layer tile folders
 * (`app/api/tiles/power-plants/[z]/[x]/[y]`). Next.js matches static segments
 * before dynamic ones, so `/api/tiles/power-plants/8/60/95` still resolves to
 * the tile route while the single-segment `/api/tiles/power-plants.json`
 * resolves here.
 */

import { corsHeaders } from "@/lib/api/cors";
import { isTileLayerId, TILE_LAYERS } from "@/lib/tiles/layer-registry";
import { buildTileJson, resolveOrigin } from "@/lib/tiles/tilejson";

/** Tile metadata changes only when tiles are regenerated — cache generously. */
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

function notFound(message: string): Response {
  return Response.json(
    { error: { code: "NOT_FOUND", message } },
    { status: 404, headers: { ...corsHeaders(), "Cache-Control": "public, s-maxage=60" } }
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ layer: string }> }): Promise<Response> {
  const { layer: segment } = await params;

  // Only the `.json` form belongs to this route. A bare `/api/tiles/{layer}` is
  // not a documented endpoint, so don't quietly serve TileJSON from it.
  if (!segment.endsWith(".json")) {
    return notFound("Not found");
  }

  const layerId = segment.slice(0, -".json".length);

  if (!isTileLayerId(layerId)) {
    return notFound(`Unknown tile layer "${layerId}". See /api/tiles.json for the available layers.`);
  }

  const tilejson = await buildTileJson(TILE_LAYERS[layerId], resolveOrigin(request));

  return Response.json(tilejson, {
    status: 200,
    headers: { ...corsHeaders(), "Cache-Control": CACHE_CONTROL },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
