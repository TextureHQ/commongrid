/**
 * GET /api/v1/balancing-authorities/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for a Balancing Authority.
 * Reads from static files in public/data/territories/ba-{slug}.json.
 *
 * Spec ref: ALL-578
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

// ---------------------------------------------------------------------------
// Static file lookup
// ---------------------------------------------------------------------------

function loadBaGeoJson(slug: string): unknown | null {
  const filePath = join(process.cwd(), "public", "data", "territories", `ba-${slug}.json`);

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
    const geojson = loadBaGeoJson(slug);

    if (!geojson) {
      throw new ApiError("NOT_FOUND", `Balancing authority boundary '${slug}' not found`);
    }

    return jsonResponse({ data: geojson }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `ba-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
