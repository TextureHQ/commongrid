/**
 * GET /api/v1/rtos/:slug/geometry
 *
 * Returns GeoJSON boundary geometry for an RTO from Postgres.
 * Falls back to the ISO boundary with the same slug/short name since RTOs
 * often share ISO boundaries.
 *
 * Spec ref: ALL-578
 */

import { sql } from "drizzle-orm";
import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { getDb } from "@/lib/db/client";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const wrapped = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const db = getDb();

    const result = await db.execute(sql`
      SELECT ST_AsGeoJSON(t.geography::geometry) AS geojson
      FROM territories t
      JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL
      JOIN rtos x ON x.region_id = r.id
      WHERE t.deleted_at IS NULL
        AND (x.slug = ${slug} OR x.short_name = ${slug})
      LIMIT 1
    `);

    const rows = result.rows as Array<{ geojson: string }>;
    if (!rows.length || !rows[0].geojson) {
      throw new ApiError("NOT_FOUND", `RTO boundary '${slug}' not found`);
    }

    return jsonResponse({ data: JSON.parse(rows[0].geojson) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `rto-geometry:${slug}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
