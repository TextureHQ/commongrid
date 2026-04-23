/**
 * GET /api/v1/isos/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for an ISO.
 * Proxies the static file at /data/territories/iso-{slug}.json
 * via fetch to avoid bundling territory files into the serverless function.
 *
 * Spec ref: ALL-578
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const origin = new URL(r.url).origin;
    const res = await fetch(`${origin}/data/territories/iso-${slug}.json`);

    if (!res.ok) {
      throw new ApiError("NOT_FOUND", `ISO boundary '${slug}' not found`);
    }

    const geojson = await res.json();
    return jsonResponse({ data: geojson }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `iso-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
