/**
 * GET /api/v1/utilities/:slug/geometry
 *
 * Resolves a utility slug to its service-territory polygon and returns a
 * GeoJSON FeatureCollection. This is the public path when a consumer only
 * has a utility slug (e.g. `green-mountain-power`) and wants the territory
 * polygon without first having to look up the region slug.
 *
 * Resolution chain (all performed server-side in a single CTE):
 *   utilities.slug
 *     → utilities.service_territory_id  (FK)
 *     → regions (type = 'SERVICE_TERRITORY')
 *     → territories  (1:1 on region_id)
 *
 * Response contract (locked 2026-05-08 in #agent-ops with Atlas, Talos, Lyra):
 *
 *   200 — utility exists AND geometry is loaded:
 *     {
 *       type: "FeatureCollection",
 *       features: [ Feature<MultiPolygon> ],
 *       metadata: {
 *         utility_slug, utility_name, eia_id, region_slug, territory_id,
 *         geometry_status: "loaded",
 *         source, source_url, area_sq_km, updated_at
 *       }
 *     }
 *
 *   200 — utility exists but polygon not yet backfilled (71 SERVICE_TERRITORY
 *   regions currently in this state, including VEC as of 2026-05-08):
 *     {
 *       type: "FeatureCollection",
 *       features: [],
 *       metadata: {
 *         utility_slug, utility_name, eia_id, region_slug,
 *         geometry_status: "pending_backfill",
 *         source: null
 *       }
 *     }
 *
 *   404 — utility slug is not in the registry:
 *     { error: "utility_not_found", slug: "…" }
 *
 * The empty-200 shape for "pending" lets map/dashboard consumers render a
 * "coverage coming soon" state without treating a known utility as an error.
 * Mapbox `addSource` treats an empty FeatureCollection as a no-op, so Relay
 * (and any other client) gets graceful degradation for free — just branch on
 * `metadata.geometry_status` and skip `addLayer` when `features.length === 0`.
 * The 404 stays flat and predictable for unknown-slug detection.
 *
 * Query params:
 *   ?simplify=0.01 — topology-preserving simplification tolerance (default 0.01).
 *
 * Cache:
 *   loaded  → Cache-Control: public, max-age=3600
 *   pending → Cache-Control: public, max-age=300  (shorter so backfills propagate)
 *   ETag    → keyed off (utility_id, territory.updated_at) when loaded;
 *             stable hash of (utility_id, geometry_status) when pending.
 *
 * Spec ref: §4.5
 */

import { createHash } from "node:crypto";

import type { Feature, FeatureCollection, MultiPolygon } from "geojson";

import { corsHeaders } from "@/lib/api/cors";

// ---------------------------------------------------------------------------
// Response envelope types
// ---------------------------------------------------------------------------

type UtilityFeatureCollection = FeatureCollection<
  MultiPolygon,
  {
    utility_slug: string;
    utility_name: string;
    eia_id: string;
    region_slug: string | null;
    territory_id: string | null;
  }
> & {
  metadata: {
    utility_slug: string;
    utility_name: string;
    eia_id: string;
    region_slug: string | null;
    territory_id: string | null;
    geometry_status: "loaded" | "pending_backfill";
    source: string | null;
    source_url?: string | null;
    area_sq_km?: number | null;
    updated_at?: string | null;
  };
};

type UtilityGeometryQueryRow = {
  utility_exists: boolean;
  region_exists: boolean;
  territory_exists: boolean;
  utility_id: string | null;
  utility_slug: string | null;
  utility_name: string | null;
  eia_id: string | null;
  region_id: string | null;
  region_slug: string | null;
  territory_id: string | null;
  territory_source: string | null;
  territory_source_url: string | null;
  area_sq_km: number | null;
  updated_at: string | Date | null;
  geojson: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_MAX_AGE_LOADED = 3600; // 1h — territories are effectively static between sync runs
const CACHE_MAX_AGE_PENDING = 300; // 5m — tighter so backfills propagate quickly

function utilityNotFoundResponse(slug: string): Response {
  return Response.json(
    { error: "utility_not_found", slug },
    {
      status: 404,
      headers: {
        ...corsHeaders(),
        "Cache-Control": "public, max-age=60",
        "Content-Type": "application/json",
      },
    }
  );
}

// ---------------------------------------------------------------------------
// OPTIONS preflight
// ---------------------------------------------------------------------------

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function computeETag(utilityId: string, status: "loaded" | "pending_backfill", updatedAt: string | null): string {
  const payload = `${utilityId}|${status}|${updatedAt ?? ""}`;
  return `"${createHash("sha256").update(payload).digest("hex").slice(0, 16)}"`;
}

function normaliseUpdatedAt(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  // Some drivers return ISO strings already; others return `YYYY-MM-DD HH:MM:SS`.
  return value;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const url = new URL(req.url);
  const simplify = url.searchParams.get("simplify");
  const tolerance = Number(simplify) || 0.01;

  const { db } = await import("@/lib/db/client");
  if (!db) {
    return Response.json(
      { error: "internal_error", message: "Database not configured" },
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }

  const { sql } = await import("drizzle-orm");

  // Single-CTE resolution so we can distinguish "utility missing" from
  // "region missing" from "territory polygon missing" in one round-trip.
  // The three `EXISTS` flags drive the response branching below.
  const result = await db.execute(
    simplify
      ? sql`
          WITH u AS (
            SELECT id, slug, name, eia_id, service_territory_id
            FROM utilities
            WHERE slug = ${slug}
              AND deleted_at IS NULL
            LIMIT 1
          ),
          r AS (
            SELECT regions.id, regions.slug
            FROM regions, u
            WHERE regions.id = u.service_territory_id
              AND regions.type = 'SERVICE_TERRITORY'
              AND regions.deleted_at IS NULL
            LIMIT 1
          ),
          t AS (
            SELECT
              territories.id,
              territories.source,
              territories.source_url,
              territories.area_sq_km,
              territories.updated_at,
              ST_AsGeoJSON(
                ST_SimplifyPreserveTopology(territories.geography::geometry, ${tolerance})
              ) AS geojson
            FROM territories, r
            WHERE territories.region_id = r.id
              AND territories.deleted_at IS NULL
            LIMIT 1
          )
          SELECT
            EXISTS (SELECT 1 FROM u) AS utility_exists,
            EXISTS (SELECT 1 FROM r) AS region_exists,
            EXISTS (SELECT 1 FROM t) AS territory_exists,
            (SELECT id FROM u)                  AS utility_id,
            (SELECT slug FROM u)                AS utility_slug,
            (SELECT name FROM u)                AS utility_name,
            (SELECT eia_id FROM u)              AS eia_id,
            (SELECT id FROM r)                  AS region_id,
            (SELECT slug FROM r)                AS region_slug,
            (SELECT id FROM t)                  AS territory_id,
            (SELECT source FROM t)              AS territory_source,
            (SELECT source_url FROM t)          AS territory_source_url,
            (SELECT area_sq_km FROM t)          AS area_sq_km,
            (SELECT updated_at FROM t)          AS updated_at,
            (SELECT geojson FROM t)             AS geojson
        `
      : sql`
          WITH u AS (
            SELECT id, slug, name, eia_id, service_territory_id
            FROM utilities
            WHERE slug = ${slug}
              AND deleted_at IS NULL
            LIMIT 1
          ),
          r AS (
            SELECT regions.id, regions.slug
            FROM regions, u
            WHERE regions.id = u.service_territory_id
              AND regions.type = 'SERVICE_TERRITORY'
              AND regions.deleted_at IS NULL
            LIMIT 1
          ),
          t AS (
            SELECT
              territories.id,
              territories.source,
              territories.source_url,
              territories.area_sq_km,
              territories.updated_at,
              ST_AsGeoJSON(territories.geography::geometry) AS geojson
            FROM territories, r
            WHERE territories.region_id = r.id
              AND territories.deleted_at IS NULL
            LIMIT 1
          )
          SELECT
            EXISTS (SELECT 1 FROM u) AS utility_exists,
            EXISTS (SELECT 1 FROM r) AS region_exists,
            EXISTS (SELECT 1 FROM t) AS territory_exists,
            (SELECT id FROM u)                  AS utility_id,
            (SELECT slug FROM u)                AS utility_slug,
            (SELECT name FROM u)                AS utility_name,
            (SELECT eia_id FROM u)              AS eia_id,
            (SELECT id FROM r)                  AS region_id,
            (SELECT slug FROM r)                AS region_slug,
            (SELECT id FROM t)                  AS territory_id,
            (SELECT source FROM t)              AS territory_source,
            (SELECT source_url FROM t)          AS territory_source_url,
            (SELECT area_sq_km FROM t)          AS area_sq_km,
            (SELECT updated_at FROM t)          AS updated_at,
            (SELECT geojson FROM t)             AS geojson
        `
  );

  const rows = ((result as unknown as { rows: UtilityGeometryQueryRow[] }).rows ?? result) as UtilityGeometryQueryRow[];
  const row = rows[0];

  // ── 404: utility slug is not in the registry ──────────────────────────────
  if (!row?.utility_exists) {
    return utilityNotFoundResponse(slug);
  }

  const utilityId = row.utility_id ?? slug;
  const utilitySlug = row.utility_slug ?? slug;
  const utilityName = row.utility_name ?? slug;
  const eiaId = row.eia_id ?? "";
  const regionSlug = row.region_slug;

  // ── 200 (empty) — utility exists but region has no polygon loaded ─────────
  //
  // "pending_backfill" covers two sub-cases that are indistinguishable to an
  // API consumer:
  //   (a) the utility has no SERVICE_TERRITORY region linked at all yet, or
  //   (b) the region exists but its polygon hasn't been ingested.
  // Both are data-gap states the backfill pipeline resolves over time. From
  // the client's perspective the answer is the same: "known utility, geometry
  // not available yet — try again after the next sync." Collapsing them into
  // one machine-readable status keeps the contract simple.
  if (!row.region_exists || !row.territory_exists || !row.geojson) {
    const payload: UtilityFeatureCollection = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        utility_slug: utilitySlug,
        utility_name: utilityName,
        eia_id: eiaId,
        region_slug: regionSlug,
        territory_id: null,
        geometry_status: "pending_backfill",
        source: null,
      },
    };

    return Response.json(payload, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE_PENDING}`,
        "Content-Type": "application/geo+json",
        ETag: computeETag(utilityId, "pending_backfill", null),
        "Cache-Tag": `utility:${utilitySlug}:geometry`,
      },
    });
  }

  // ── 200 — geometry is loaded ──────────────────────────────────────────────
  const geometry = JSON.parse(row.geojson) as MultiPolygon;
  const updatedAt = normaliseUpdatedAt(row.updated_at);

  const feature: Feature<MultiPolygon, UtilityFeatureCollection["features"][number]["properties"]> = {
    type: "Feature",
    geometry,
    properties: {
      utility_slug: utilitySlug,
      utility_name: utilityName,
      eia_id: eiaId,
      region_slug: regionSlug,
      territory_id: row.territory_id,
    },
  };

  const payload: UtilityFeatureCollection = {
    type: "FeatureCollection",
    features: [feature],
    metadata: {
      utility_slug: utilitySlug,
      utility_name: utilityName,
      eia_id: eiaId,
      region_slug: regionSlug,
      territory_id: row.territory_id,
      geometry_status: "loaded",
      source: row.territory_source,
      source_url: row.territory_source_url,
      area_sq_km: row.area_sq_km,
      updated_at: updatedAt,
    },
  };

  return Response.json(payload, {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Cache-Control": `public, max-age=${CACHE_MAX_AGE_LOADED}`,
      "Content-Type": "application/geo+json",
      ETag: computeETag(utilityId, "loaded", updatedAt),
      "Cache-Tag": `utility:${utilitySlug}:geometry`,
    },
  });
}
