/**
 * GET /api/tiles.json
 *
 * Index of every vector tile layer CommonGrid publishes, with a link to each
 * layer's TileJSON document. This is the discovery entry point: fetch it once
 * and you know every layer available, its zoom range, and its tile URL.
 *
 * Not itself a TileJSON document (TileJSON describes exactly one tileset), so
 * it uses a small wrapper shape instead of pretending to be one.
 */

import { corsHeaders } from "@/lib/api/cors";
import { TILE_LAYER_IDS, TILE_LAYERS, tileLayerAttribution } from "@/lib/tiles/layer-registry";
import { buildTileJson, resolveOrigin, tileJsonUrl } from "@/lib/tiles/tilejson";

/** Tile metadata changes only when tiles are regenerated — cache generously. */
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request): Promise<Response> {
  const origin = resolveOrigin(request);

  const layers = await Promise.all(
    TILE_LAYER_IDS.map(async (id) => {
      const layer = TILE_LAYERS[id];
      // Reuse the per-layer builder so the index can never disagree with the
      // individual documents about zoom ranges or tile URLs.
      const tilejson = await buildTileJson(layer, origin);

      return {
        id: layer.id,
        name: layer.name,
        description: layer.description,
        attribution: tileLayerAttribution(layer),
        tilejson: tileJsonUrl(origin, layer.id),
        tiles: tilejson.tiles,
        minzoom: tilejson.minzoom,
        maxzoom: tilejson.maxzoom,
        bounds: tilejson.bounds,
        /** MVT source-layer names inside this tileset, for `source-layer` in a style. */
        sourceLayers: tilejson.vector_layers.map((vl) => vl.id),
      };
    })
  );

  return Response.json(
    {
      tilejson_version: "3.0.0",
      attribution: '<a href="https://commongrid.info">CommonGrid</a>',
      layers,
    },
    { status: 200, headers: { ...corsHeaders(), "Cache-Control": CACHE_CONTROL } }
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
