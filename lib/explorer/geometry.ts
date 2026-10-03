import type { FeatureCollection, Geometry } from "geojson";

type GeometryApiResponse =
  | (FeatureCollection & { metadata?: { geometry_status?: string } })
  | { data: Geometry | null };

function isFeatureCollection(value: unknown): value is FeatureCollection & { metadata?: { geometry_status?: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: string }).type === "FeatureCollection" &&
    "features" in value &&
    Array.isArray((value as { features: unknown }).features)
  );
}

function isGeometryEnvelope(value: unknown): value is { data: Geometry | null } {
  return typeof value === "object" && value !== null && "data" in value;
}

/**
 * Fetch a DB-backed geometry endpoint and normalize the response to a GeoJSON
 * FeatureCollection.
 *
 * The geometry routes currently return two shapes:
 *   - FeatureCollection directly (e.g. /api/v1/utilities/:slug/geometry). These
 *     may carry `metadata.geometry_status === "pending_backfill"` with empty
 *     `features`; such responses are treated as "no geometry yet" and returned
 *     as `null` so callers render gracefully instead of erroring.
 *   - `{ data: <GeoJSON Geometry> }` (e.g. /api/v1/isos/:slug/geometry,
 *     /api/v1/rtos/:slug/geometry, /api/v1/balancing-authorities/:slug/geometry,
 *     /api/v1/territories/:slug/geometry). The geometry is wrapped in a
 *     single-feature FeatureCollection.
 *
 * 404s and malformed bodies are normalized to `null`, preserving the existing
 * explorer "clear highlight on missing data" UX.
 */
export async function fetchGeometry(url: string): Promise<FeatureCollection | null> {
  const res = await fetch(url);
  if (!res.ok) return null;

  const body = (await res.json()) as GeometryApiResponse;

  if (isFeatureCollection(body)) {
    if (body.metadata?.geometry_status === "pending_backfill" || body.features.length === 0) {
      return null;
    }
    return body;
  }

  if (isGeometryEnvelope(body) && body.data) {
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: body.data }],
    };
  }

  return null;
}

export function fetchUtilityGeometry(slug: string): Promise<FeatureCollection | null> {
  return fetchGeometry(`/api/v1/utilities/${encodeURIComponent(slug)}/geometry`);
}

export function fetchIsoGeometry(slug: string): Promise<FeatureCollection | null> {
  return fetchGeometry(`/api/v1/isos/${encodeURIComponent(slug)}/geometry`);
}

export function fetchRtoGeometry(slug: string): Promise<FeatureCollection | null> {
  return fetchGeometry(`/api/v1/rtos/${encodeURIComponent(slug)}/geometry`);
}

export function fetchBalancingAuthorityGeometry(slug: string): Promise<FeatureCollection | null> {
  return fetchGeometry(`/api/v1/balancing-authorities/${encodeURIComponent(slug)}/geometry`);
}

export function fetchTerritoryGeometry(slug: string): Promise<FeatureCollection | null> {
  return fetchGeometry(`/api/v1/territories/${encodeURIComponent(slug)}/geometry`);
}
