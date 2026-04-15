/**
 * GET /api/v1/territories/:id/geometry
 *
 * Returns GeoJSON geometry for a specific territory.
 * JSON mode reads from data/territories/{eiaId}.json files.
 * Database mode reads from PostGIS with optional simplification.
 *
 * Query params:
 *   ?simplify=0.01  — Simplification tolerance (database mode only)
 *
 * Spec ref: §4.5
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// JSON mode: load territory GeoJSON from static files
// ---------------------------------------------------------------------------

async function loadTerritoryGeoJsonFromFile(regionId: string) {
  const regions = (await import("@/data/regions.json")).default;
  const region = regions.find((r: { id: string; eiaId: string | null }) => r.id === regionId);

  if (!region?.eiaId) return null;

  const fs = await import("node:fs");
  const path = await import("node:path");
  const filePath = path.join(process.cwd(), "data", "territories", `${region.eiaId}.json`);

  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;

  const wrapped = withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const url = new URL(r.url);

    // JSON mode
    if (getDataSource("regions") === "json") {
      const geojson = await loadTerritoryGeoJsonFromFile(id);

      if (!geojson) {
        throw new ApiError("NOT_FOUND", `Territory '${id}' not found`);
      }

      return jsonResponse({ data: geojson }, 200, {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        "Cache-Tag": `territory:${id}`,
      });
    }

    // Database mode
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
              FROM territories WHERE id = ${id}
            `
        : sql`
              SELECT ST_AsGeoJSON(geography::geometry) as geojson
              FROM territories WHERE id = ${id}
            `
    );

    const rows = result as unknown as Array<{ geojson: string }>;
    if (!rows.length) {
      throw new ApiError("NOT_FOUND", `Territory '${id}' not found`);
    }

    return jsonResponse({ data: JSON.parse(rows[0].geojson) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `territory:${id}`,
    });
  });

  return wrapped(req, { requestId: "" });
}
