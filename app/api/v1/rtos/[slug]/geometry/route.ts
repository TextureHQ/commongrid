/**
 * GET /api/v1/rtos/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for an RTO.
 * Tries rto-{slug}.json first, then falls back to iso-{slug}.json
 * since RTOs often share ISO boundaries.
 * Uses fetch to avoid bundling territory files into the serverless function.
 *
 * Spec ref: ALL-578
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const origin = new URL(r.url).origin;

    // Try rto-{slug}.json first
    let res = await fetch(`${origin}/data/territories/rto-${slug}.json`);

    // Fall back to iso-{slug}.json (RTOs often share ISO boundaries)
    if (!res.ok) {
      res = await fetch(`${origin}/data/territories/iso-${slug}.json`);
    }

    if (!res.ok) {
      throw new ApiError("NOT_FOUND", `RTO boundary '${slug}' not found`);
    }

    const geojson = await res.json();
    return jsonResponse({ data: geojson }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `rto-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
