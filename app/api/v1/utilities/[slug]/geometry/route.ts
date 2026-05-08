/**
 * GET /api/v1/utilities/:slug/geometry
 *
 * Returns GeoJSON geometry for a utility's service territory from PostGIS.
 *
 * Resolution path:
 *   utilities.slug → utilities.eia_id →
 *     regions (type = 'SERVICE_TERRITORY', joined on eia_id) →
 *       territories (joined on region_id) → geography
 *
 * Query params:
 *   ?simplify=0.01  — Simplification tolerance (topology-preserving)
 *
 * This is the natural public path when a consumer only has a utility slug
 * (e.g. `green-mountain-power`) and wants the service-territory polygon.
 * It complements `/territories/{slug}/geometry`, which accepts a region
 * or territory slug.
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

    // Single query that resolves the full chain in one round-trip and reports
    // *why* it failed (utility missing vs. no region vs. no territory row).
    // The three-valued result lets us return a helpful, specific 404 that
    // tells consumers whether to keep checking back (geometry pending) or
    // fix their slug (utility unknown).
    const result = await db.execute(
      simplify
        ? sql`
            WITH u AS (
              SELECT eia_id
              FROM utilities
              WHERE slug = ${slug}
                AND deleted_at IS NULL
              LIMIT 1
            ),
            r AS (
              SELECT regions.id
              FROM regions, u
              WHERE regions.eia_id = u.eia_id
                AND regions.type = 'SERVICE_TERRITORY'
                AND regions.deleted_at IS NULL
              LIMIT 1
            ),
            t AS (
              SELECT ST_AsGeoJSON(
                ST_SimplifyPreserveTopology(territories.geography::geometry, ${tolerance})
              ) AS geojson
              FROM territories, r
              WHERE territories.region_id = r.id
                AND territories.deleted_at IS NULL
              LIMIT 1
            )
            SELECT
              (SELECT eia_id FROM u)    AS utility_eia_id,
              (SELECT id FROM r)        AS region_id,
              (SELECT geojson FROM t)   AS geojson,
              EXISTS (SELECT 1 FROM u)  AS utility_exists,
              EXISTS (SELECT 1 FROM r)  AS region_exists,
              EXISTS (SELECT 1 FROM t)  AS territory_exists
          `
        : sql`
            WITH u AS (
              SELECT eia_id
              FROM utilities
              WHERE slug = ${slug}
                AND deleted_at IS NULL
              LIMIT 1
            ),
            r AS (
              SELECT regions.id
              FROM regions, u
              WHERE regions.eia_id = u.eia_id
                AND regions.type = 'SERVICE_TERRITORY'
                AND regions.deleted_at IS NULL
              LIMIT 1
            ),
            t AS (
              SELECT ST_AsGeoJSON(territories.geography::geometry) AS geojson
              FROM territories, r
              WHERE territories.region_id = r.id
                AND territories.deleted_at IS NULL
              LIMIT 1
            )
            SELECT
              (SELECT eia_id FROM u)    AS utility_eia_id,
              (SELECT id FROM r)        AS region_id,
              (SELECT geojson FROM t)   AS geojson,
              EXISTS (SELECT 1 FROM u)  AS utility_exists,
              EXISTS (SELECT 1 FROM r)  AS region_exists,
              EXISTS (SELECT 1 FROM t)  AS territory_exists
          `
    );

    const rows = ((result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? result) as Array<{
      utility_exists: boolean;
      region_exists: boolean;
      territory_exists: boolean;
      geojson: string | null;
    }>;

    const row = rows[0];

    if (!row || !row.utility_exists) {
      throw new ApiError("NOT_FOUND", `Utility '${slug}' not found. Check the slug against GET /api/v1/utilities.`);
    }

    if (!row.region_exists) {
      // Utility exists but has no SERVICE_TERRITORY region linked. This is
      // typically an EIA-id gap (newer co-op without a territory filing yet).
      throw new ApiError(
        "NOT_FOUND",
        `Utility '${slug}' has no service-territory region registered yet. Geometry is not available for this utility. This may change as new EIA filings are ingested.`
      );
    }

    if (!row.territory_exists || !row.geojson) {
      // Region exists (metadata present) but no territory polygon backfilled.
      // The classic "known but ungeographed" case — consumers should check
      // back later as the backfill pipeline progresses.
      throw new ApiError(
        "NOT_FOUND",
        `Utility '${slug}' service territory has no geometry loaded yet. The region is registered but the polygon has not been backfilled. Check back after the next territory sync.`
      );
    }

    return jsonResponse({ data: JSON.parse(row.geojson) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "Cache-Tag": `utility:${slug}:geometry`,
    });
  });

  return wrapped(req, { requestId: "" });
}
