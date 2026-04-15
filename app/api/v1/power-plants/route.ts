import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";
import { parseBbox } from "@/lib/api/validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PowerPlantRecord = Record<string, any>;

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const sp = request.nextUrl.searchParams;
    const search = sp.get("search"), state = sp.get("state"), fuelCategory = sp.get("fuelCategory");
    const status = sp.get("status"), utilityId = sp.get("utilityId"), baId = sp.get("baId");
    const minCapacityMw = sp.get("minCapacityMw"), maxCapacityMw = sp.get("maxCapacityMw");
    const lat = sp.get("lat"), lng = sp.get("lng"), radius = sp.get("radius"), bboxParam = sp.get("bbox");
    const limit = sp.get("limit") ? Math.min(Math.max(parseInt(sp.get("limit")!, 10) || 50, 1), 200) : 50;
    const page = sp.get("page") ? Math.max(parseInt(sp.get("page")!, 10) || 0, 0) : 0;

    if (getDataSource("powerPlants") === "json") {
      const data: PowerPlantRecord[] = (await import("@/data/power-plants.json")).default;
      let filtered = data;
      if (state) filtered = filtered.filter((p) => p.state?.toLowerCase() === state.toLowerCase());
      if (fuelCategory) filtered = filtered.filter((p) => p.fuelCategory?.toLowerCase() === fuelCategory.toLowerCase());
      if (status) filtered = filtered.filter((p) => p.status?.toLowerCase() === status.toLowerCase());
      if (utilityId) filtered = filtered.filter((p) => p.utilityId === utilityId);
      if (baId) filtered = filtered.filter((p) => p.balancingAuthorityId === baId);
      if (minCapacityMw) { const v = parseFloat(minCapacityMw); if (!isNaN(v)) filtered = filtered.filter((p) => p.totalCapacityMw >= v); }
      if (maxCapacityMw) { const v = parseFloat(maxCapacityMw); if (!isNaN(v)) filtered = filtered.filter((p) => p.totalCapacityMw <= v); }
      if (search) { const q = search.toLowerCase(); filtered = filtered.filter((p) => p.name?.toLowerCase().includes(q) || p.utilityName?.toLowerCase().includes(q)); }
      if (lat && lng) {
        const la = parseFloat(lat), lo = parseFloat(lng), r = radius ? parseFloat(radius) : 50;
        if (isNaN(la) || isNaN(lo)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");
        filtered = filtered.map((p) => ({ ...p, _d: haversine(la, lo, p.latitude, p.longitude) })).filter((p) => p._d <= r).sort((a, b) => a._d - b._d);
      }
      if (bboxParam) { const b = parseBbox(bboxParam); filtered = filtered.filter((p) => p.longitude >= b.west && p.longitude <= b.east && p.latitude >= b.south && p.latitude <= b.north); }
      const total = filtered.length, offset = page * limit;
      return withCors(jsonResponse({ data: filtered.slice(offset, offset + limit), pagination: { cursor: null, limit, total, hasMore: offset + limit < total } }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");
    const { powerPlants } = await import("@/lib/db/schema/power-plants");
    const { eq, ilike, and, gte, lte, sql } = await import("drizzle-orm");
    const conds = [];
    if (state) conds.push(eq(powerPlants.state, state.toUpperCase()));
    if (fuelCategory) conds.push(eq(powerPlants.fuelCategory, fuelCategory));
    if (status) conds.push(eq(powerPlants.status, status.toLowerCase()));
    if (utilityId) conds.push(eq(powerPlants.utilityId, utilityId));
    if (baId) conds.push(eq(powerPlants.balancingAuthorityId, baId));
    if (minCapacityMw) { const v = parseFloat(minCapacityMw); if (!isNaN(v)) conds.push(gte(powerPlants.totalCapacityMw, v)); }
    if (maxCapacityMw) { const v = parseFloat(maxCapacityMw); if (!isNaN(v)) conds.push(lte(powerPlants.totalCapacityMw, v)); }
    if (search) conds.push(ilike(powerPlants.name, `%${search}%`));
    if (bboxParam) { const b = parseBbox(bboxParam); conds.push(sql`${powerPlants.geometry} && ST_MakeEnvelope(${b.west}, ${b.south}, ${b.east}, ${b.north}, 4326)`); }
    if (lat && lng) {
      const la = parseFloat(lat), lo = parseFloat(lng), r = (radius ? parseFloat(radius) : 50) * 1000;
      if (isNaN(la) || isNaN(lo)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");
      conds.push(sql`ST_DWithin(${powerPlants.geography}, ST_SetSRID(ST_MakePoint(${lo}, ${la}), 4326)::geography, ${r})`);
      const w = conds.length ? and(...conds) : undefined;
      const rows = await db.select().from(powerPlants).where(w).orderBy(sql`ST_Distance(${powerPlants.geography}, ST_SetSRID(ST_MakePoint(${lo}, ${la}), 4326)::geography)`).limit(limit);
      return withCors(jsonResponse(paginatedResponse(rows, rows.length, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
    }
    const w = conds.length ? and(...conds) : undefined;
    const rows = await db.select().from(powerPlants).where(w).orderBy(powerPlants.name).limit(limit);
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(powerPlants).where(w);
    return withCors(jsonResponse(paginatedResponse(rows, Number(cnt[0]?.count ?? 0), null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
  } catch (error) {
    if (error instanceof ApiError) return withCors(jsonResponse(formatError(error, requestId), error.status, { "X-Request-Id": requestId }));
    console.error(`[${requestId}] Unexpected error:`, error);
    return withCors(jsonResponse(formatError(new ApiError("INTERNAL_ERROR", "An unexpected error occurred"), requestId), 500, { "X-Request-Id": requestId }));
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
