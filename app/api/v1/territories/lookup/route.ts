/**
 * GET /api/v1/territories/lookup
 *
 * Point-in-polygon lookup — find which territories contain a given lat/lng.
 * Uses PostGIS ST_Covers.
 *
 * Query params:
 *   ?lat=40.7128&lng=-74.0060
 *
 * Spec ref: §4.6
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const handler = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
  const url = new URL(r.url);
  const latStr = url.searchParams.get("lat");
  const lngStr = url.searchParams.get("lng");

  if (!latStr || !lngStr) {
    throw new ApiError("BAD_REQUEST", "lat and lng query parameters are required");
  }

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new ApiError("VALIDATION_ERROR", "lat and lng must be valid numbers");
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError("VALIDATION_ERROR", "lat must be between -90 and 90, lng between -180 and 180");
  }

  const { db } = await import("@/lib/db/client");
  if (!db) {
    throw new ApiError("INTERNAL_ERROR", "Database not configured");
  }

  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql`
      SELECT t.id, r.name, r.type, r.state, r.slug
      FROM territories t
      JOIN regions r ON r.id = t.region_id
      WHERE ST_Covers(t.geography, ST_Point(${lng}, ${lat})::geography)
      ORDER BY r.type
      LIMIT 10
    `);

  // Extract rows only — raw db.execute() returns the full Neon driver
  // result object which leaks internal metadata (field types, parsers, etc.)
  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? result;

  return jsonResponse({ data: rows }, 200, {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
  });
});

export async function GET(req: Request): Promise<Response> {
  return handler(req, { requestId: "" });
}
