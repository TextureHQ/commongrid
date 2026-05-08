/**
 * GET /api/v1/territories/:slug/geometry
 *
 * Returns GeoJSON geometry for a specific territory from PostGIS.
 *
 * Accepts two slug forms (checked in this order for backward compatibility):
 *   1. `territories.id`  — the internal territory row id (e.g. `territory-7601`).
 *   2. `regions.slug`    — the human-friendly region slug
 *      (e.g. `st-green-mountain-power-corp-7601`). This is the form documented
 *      elsewhere in the API and is what consumers typically discover.
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
    const tolerance = Number(simplify) || 0.01;

    const { sql } = await import("drizzle-orm");

    // Try both slug forms in a single query. `territories.id = $slug` preserves
    // the original behavior (internal territory row id); the LEFT JOIN on
    // `regions.slug = $slug` covers the discoverable region-slug form.
    const result = await db.execute(
      simplify
        ? sql`
            SELECT ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(t.geography::geometry, ${tolerance})
            ) AS geojson
            FROM territories t
            LEFT JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL
            WHERE t.deleted_at IS NULL
              AND (t.id = ${slug} OR r.slug = ${slug})
            LIMIT 1
          `
        : sql`
            SELECT ST_AsGeoJSON(t.geography::geometry) AS geojson
            FROM territories t
            LEFT JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL
            WHERE t.deleted_at IS NULL
              AND (t.id = ${slug} OR r.slug = ${slug})
            LIMIT 1
          `
    );

    const rows = ((result as unknown as { rows: Array<{ geojson: string }> }).rows ?? result) as Array<{
      geojson: string;
    }>;
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
