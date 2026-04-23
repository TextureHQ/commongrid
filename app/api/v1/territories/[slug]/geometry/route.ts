/**
 * GET /api/v1/territories/:slug/geometry
 *
 * Returns GeoJSON geometry for a specific territory from PostGIS.
 *
 * Query params:
 *   ?simplify=0.01  — Simplification tolerance
 *
 * Spec ref: §4.5
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const url = new URL(r.url);

    const { db } = await import("@/lib/db/client");
    if (!db) {
      throw new ApiError("INTERNAL_ERROR", "Database not configured");
    }

    const simplify = url.searchParams.get("simplify");

    const { sql } = await import("drizzle-orm");
    const result = await db.execute(
      simplify
        ? sql`
              SELECT ST_AsGeoJSON(
                ST_SimplifyPreserveTopology(geography::geometry, ${Number(simplify) || 0.01})
              ) as geojson
              FROM territories WHERE id = ${slug}
            `
        : sql`
              SELECT ST_AsGeoJSON(geography::geometry) as geojson
              FROM territories WHERE id = ${slug}
            `
    );

    const rows = ((result as unknown as { rows: Array<{ geojson: string }> }).rows ?? result) as Array<{ geojson: string }>;
    if (!rows.length) {
      throw new ApiError("NOT_FOUND", `Territory '${slug}' not found`);
    }

    return jsonResponse({ data: JSON.parse(rows[0].geojson) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `territory:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
