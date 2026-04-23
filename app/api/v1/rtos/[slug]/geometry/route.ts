/**
 * GET /api/v1/rtos/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for an RTO.
 * RTOs share boundary files with their parent ISO.
 * Falls back to iso-{slug}.json if rto-{slug}.json doesn't exist.
 *
 * Spec ref: ALL-578
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

// ---------------------------------------------------------------------------
// Static file lookup
// ---------------------------------------------------------------------------

function loadRtoGeoJson(slug: string): unknown | null {
  const territoriesDir = join(process.cwd(), "public", "data", "territories");

  // Try rto-{slug}.json first
  const rtoPath = join(territoriesDir, `rto-${slug}.json`);
  if (existsSync(rtoPath)) {
    return JSON.parse(readFileSync(rtoPath, "utf-8"));
  }

  // Fall back to iso-{slug}.json (RTOs often share ISO boundaries)
  const isoPath = join(territoriesDir, `iso-${slug}.json`);
  if (existsSync(isoPath)) {
    return JSON.parse(readFileSync(isoPath, "utf-8"));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (_r: Request, _ctx: RouteContext) => {
    const geojson = loadRtoGeoJson(slug);

    if (!geojson) {
      throw new ApiError("NOT_FOUND", `RTO boundary '${slug}' not found`);
    }

    return jsonResponse({ data: geojson }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `rto-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
