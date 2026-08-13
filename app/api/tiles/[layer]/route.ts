/**
 * GET /api/tiles/{layer}.json
 *
 * Returns a TileJSON 3.0.0 document describing a single CommonGrid vector
 * tile layer. The `tiles` URL is absolute and points at the canonical
 * `/api/tiles/{layer}/{z}/{x}/{y}` endpoint.
 */

import { notFound } from "next/navigation";
import { corsHeaders } from "@/lib/api/cors";
import { getArchiveMetadata } from "@/lib/pmtiles-server";
import { getTileLayerById } from "@/lib/tiles/layer-registry";
import { buildTileJson } from "@/lib/tiles/tilejson";

export async function GET(request: Request, { params }: { params: Promise<{ layer: string }> }) {
  const { layer } = await params;
  const layerId = layer.replace(/\.json$/, "");
  const layerDef = getTileLayerById(layerId);

  if (!layerDef) {
    notFound();
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const metadata = await getArchiveMetadata(layerId);
  if (!metadata) {
    notFound();
  }

  const tilejson = buildTileJson(request, layerDef, metadata);
  const headers = corsHeaders();
  headers["Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=604800";

  return Response.json(tilejson, { status: 200, headers });
}
