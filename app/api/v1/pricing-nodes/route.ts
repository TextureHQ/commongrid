import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PricingNode = Record<string, any>;

/** Haversine distance in km between two lat/lng pairs. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/v1/pricing-nodes
 *
 * List pricing nodes with filtering, search, and spatial queries.
 * Supports dual-mode: JSON fallback or database via feature flags.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const searchParams = request.nextUrl.searchParams;
    const iso = searchParams.get("iso");
    const nodeType = searchParams.get("nodeType");
    const state = searchParams.get("state");
    const zone = searchParams.get("zone");
    const search = searchParams.get("search");
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    if (getDataSource("pricingNodes") === "json") {
      const data: PricingNode[] = (await import("@/data/pricing-nodes.json")).default;
      let filtered = data;

      if (iso) filtered = filtered.filter((n) => n.iso?.toLowerCase() === iso.toLowerCase());
      if (nodeType) filtered = filtered.filter((n) => n.nodeType?.toLowerCase() === nodeType.toLowerCase());
      if (state) filtered = filtered.filter((n) => n.state?.toLowerCase() === state.toLowerCase());
      if (zone) filtered = filtered.filter((n) => n.zone?.toLowerCase() === zone.toLowerCase());
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((n) => n.name?.toLowerCase().includes(q));
      }

      if (lat && lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const radiusKm = radius ? parseFloat(radius) : 50;
        if (isNaN(latNum) || isNaN(lngNum)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");

        filtered = filtered
          .map((n) => ({ ...n, _distance: haversineKm(latNum, lngNum, n.latitude, n.longitude) }))
          .filter((n) => n._distance <= radiusKm)
          .sort((a, b) => a._distance - b._distance);
      }

      const total = filtered.length;
      const page = filtered.slice(0, limit);
      return withCors(jsonResponse(paginatedResponse(page, total, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    // Database path
    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { pricingNodes } = await import("@/lib/db/schema/pricing-nodes");
    const { eq, ilike, and, sql } = await import("drizzle-orm");

    const conditions = [];
    if (iso) conditions.push(eq(pricingNodes.iso, iso.toUpperCase()));
    if (nodeType) conditions.push(eq(pricingNodes.nodeType, nodeType.toLowerCase()));
    if (state) conditions.push(eq(pricingNodes.state, state.toUpperCase()));
    if (zone) conditions.push(eq(pricingNodes.zone, zone.toUpperCase()));
    if (search) conditions.push(ilike(pricingNodes.name, `%${search}%`));

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      const radiusKm = radius ? parseFloat(radius) : 50;
      if (isNaN(latNum) || isNaN(lngNum)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");

      const radiusMeters = radiusKm * 1000;
      conditions.push(sql`ST_DWithin(${pricingNodes.geography}, ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography, ${radiusMeters})`);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db.select().from(pricingNodes).where(where).orderBy(sql`ST_Distance(${pricingNodes.geography}, ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography)`).limit(limit);
      return withCors(jsonResponse(paginatedResponse(rows, rows.length, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(pricingNodes).where(where).orderBy(pricingNodes.name).limit(limit);
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(pricingNodes).where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return withCors(jsonResponse(paginatedResponse(rows, total, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
  } catch (error) {
    if (error instanceof ApiError) {
      return withCors(jsonResponse(formatError(error, requestId), error.status, { "X-Request-Id": requestId }));
    }
    console.error(`[${requestId}] Unexpected error:`, error);
    const internal = new ApiError("INTERNAL_ERROR", "An unexpected error occurred");
    return withCors(jsonResponse(formatError(internal, requestId), 500, { "X-Request-Id": requestId }));
  }
}
