/**
 * GET /api/v1/isos/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for an ISO.
 * Reads from static files in public/data/territories/iso-{shortName}.json.
 *
 * Spec ref: ALL-578
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

// ---------------------------------------------------------------------------
// Static file lookup
// ---------------------------------------------------------------------------

function loadIsoGeoJson(slug: string): unknown | null {
  // Try direct slug match first: iso-{slug}.json
  const filePath = join(process.cwd(), "public", "data", "territories", `iso-${slug}.json`);

  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (_r: Request, _ctx: RouteContext) => {
    const geojson = loadIsoGeoJson(slug);

    if (!geojson) {
      throw new ApiError("NOT_FOUND", `ISO boundary '${slug}' not found`);
    }

    return jsonResponse({ data: geojson }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `iso-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
