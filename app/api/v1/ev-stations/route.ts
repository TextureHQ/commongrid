import { NextRequest } from "next/server";
import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";
import { parseBbox } from "@/lib/api/validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EVStationRecord = Record<string, any>;

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const sp = request.nextUrl.searchParams;
    const search = sp.get("search"), state = sp.get("state"), city = sp.get("city");
    const network = sp.get("network"), accessCode = sp.get("accessCode"), statusCode = sp.get("statusCode");
    const hasLevel2 = sp.get("hasLevel2"), hasDcFast = sp.get("hasDcFast");
    const lat = sp.get("lat"), lng = sp.get("lng"), radius = sp.get("radius"), bboxParam = sp.get("bbox");
    const limit = sp.get("limit") ? Math.min(Math.max(parseInt(sp.get("limit")!, 10) || 50, 1), 200) : 50;
    const page = sp.get("page") ? Math.max(parseInt(sp.get("page")!, 10) || 0, 0) : 0;

    if (getDataSource("evStations") === "json") {
      const data: EVStationRecord[] = (await import("@/data/ev-charging.json")).default;
      let filtered = data;
      if (state) filtered = filtered.filter((s) => s.state?.toLowerCase() === state.toLowerCase());
      if (city) filtered = filtered.filter((s) => s.city?.toLowerCase() === city.toLowerCase());
      if (network) filtered = filtered.filter((s) => s.evNetwork?.toLowerCase() === network.toLowerCase());
      if (accessCode) filtered = filtered.filter((s) => s.accessCode?.toLowerCase() === accessCode.toLowerCase());
      if (statusCode) filtered = filtered.filter((s) => s.statusCode?.toUpperCase() === statusCode.toUpperCase());
      if (hasLevel2 === "true") filtered = filtered.filter((s) => s.evLevel2EvseNum > 0);
      if (hasLevel2 === "false") filtered = filtered.filter((s) => s.evLevel2EvseNum === 0);
      if (hasDcFast === "true") filtered = filtered.filter((s) => s.evDcFastNum > 0);
      if (hasDcFast === "false") filtered = filtered.filter((s) => s.evDcFastNum === 0);
      if (search) { const q = search.toLowerCase(); filtered = filtered.filter((s) => s.stationName?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q)); }
      if (lat && lng) {
        const la = parseFloat(lat), lo = parseFloat(lng), r = radius ? parseFloat(radius) : 50;
        if (isNaN(la) || isNaN(lo)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");
        filtered = filtered.map((s) => ({ ...s, _d: haversine(la, lo, s.latitude, s.longitude) })).filter((s) => s._d <= r).sort((a, b) => a._d - b._d);
      }
      if (bboxParam) { const b = parseBbox(bboxParam); filtered = filtered.filter((s) => s.longitude >= b.west && s.longitude <= b.east && s.latitude >= b.south && s.latitude <= b.north); }
      const total = filtered.length, offset = page * limit;
      return withCors(jsonResponse({ data: filtered.slice(offset, offset + limit), pagination: { cursor: null, limit, total, hasMore: offset + limit < total } }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");
    const { evStations } = await import("@/lib/db/schema/ev-stations");
    const { eq, ilike, and, gt, sql } = await import("drizzle-orm");
    const conds = [];
    if (state) conds.push(eq(evStations.state, state.toUpperCase()));
    if (city) conds.push(ilike(evStations.city, city));
    if (network) conds.push(eq(evStations.evNetwork, network));
    if (accessCode) conds.push(eq(evStations.accessCode, accessCode.toLowerCase()));
    if (statusCode) conds.push(eq(evStations.statusCode, statusCode.toUpperCase()));
    if (hasLevel2 === "true") conds.push(gt(evStations.evLevel2EvseNum, 0));
    if (hasDcFast === "true") conds.push(gt(evStations.evDcFastNum, 0));
    if (search) conds.push(ilike(evStations.stationName, `%${search}%`));
    if (bboxParam) { const b = parseBbox(bboxParam); conds.push(sql`${evStations.geometry} && ST_MakeEnvelope(${b.west}, ${b.south}, ${b.east}, ${b.north}, 4326)`); }
    if (lat && lng) {
      const la = parseFloat(lat), lo = parseFloat(lng), r = (radius ? parseFloat(radius) : 50) * 1000;
      if (isNaN(la) || isNaN(lo)) throw new ApiError("BAD_REQUEST", "lat and lng must be valid numbers");
      conds.push(sql`ST_DWithin(${evStations.geography}, ST_SetSRID(ST_MakePoint(${lo}, ${la}), 4326)::geography, ${r})`);
      const w = conds.length ? and(...conds) : undefined;
      const rows = await db.select().from(evStations).where(w).orderBy(sql`ST_Distance(${evStations.geography}, ST_SetSRID(ST_MakePoint(${lo}, ${la}), 4326)::geography)`).limit(limit);
      return withCors(jsonResponse(paginatedResponse(rows, rows.length, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
    }
    const w = conds.length ? and(...conds) : undefined;
    const rows = await db.select().from(evStations).where(w).orderBy(evStations.stationName).limit(limit);
    const cnt = await db.select({ count: sql<number>`count(*)` }).from(evStations).where(w);
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
