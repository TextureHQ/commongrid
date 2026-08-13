/**
 * GET /api/tiles.json
 *
 * Index of all published CommonGrid vector tile layers with links to their
 * TileJSON documents.
 */

import { corsHeaders } from "@/lib/api/cors";
import { buildTileJsonIndex } from "@/lib/tiles/tilejson";

export async function GET(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const index = buildTileJsonIndex(request);
  const headers = corsHeaders();
  headers["Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=604800";

  return Response.json(index, { status: 200, headers });
}
