import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransmissionLine = Record<string, any>;

/**
 * GET /api/v1/transmission-lines
 *
 * List transmission lines with filtering.
 * Supports dual-mode: JSON fallback or database via feature flags.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const searchParams = request.nextUrl.searchParams;
    const voltageClass = searchParams.get("voltageClass");
    const owner = searchParams.get("owner");
    const status = searchParams.get("status");
    const minVoltage = searchParams.get("minVoltage");
    const maxVoltage = searchParams.get("maxVoltage");
    const search = searchParams.get("search");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    if (getDataSource("transmissionLines") === "json") {
      const data: TransmissionLine[] = (await import("@/data/transmission-lines.json")).default;
      let filtered = data;

      if (voltageClass) filtered = filtered.filter((t) => t.voltageClass?.toLowerCase() === voltageClass.toLowerCase());
      if (owner) {
        const ownerLower = owner.toLowerCase();
        filtered = filtered.filter((t) => t.owner?.toLowerCase().includes(ownerLower));
      }
      if (status) filtered = filtered.filter((t) => t.status?.toLowerCase() === status.toLowerCase());
      if (minVoltage) {
        const min = parseFloat(minVoltage);
        if (isNaN(min)) throw new ApiError("BAD_REQUEST", "minVoltage must be a valid number");
        filtered = filtered.filter((t) => t.voltage != null && t.voltage >= min);
      }
      if (maxVoltage) {
        const max = parseFloat(maxVoltage);
        if (isNaN(max)) throw new ApiError("BAD_REQUEST", "maxVoltage must be a valid number");
        filtered = filtered.filter((t) => t.voltage != null && t.voltage <= max);
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((t) => t.owner?.toLowerCase().includes(q) || t.sub1?.toLowerCase().includes(q) || t.sub2?.toLowerCase().includes(q));
      }

      const total = filtered.length;
      const page = filtered.slice(0, limit);
      return withCors(jsonResponse(paginatedResponse(page, total, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { transmissionLines } = await import("@/lib/db/schema/transmission-lines");
    const { eq, ilike, and, or, gte, lte, sql } = await import("drizzle-orm");

    const conditions = [];
    if (voltageClass) conditions.push(eq(transmissionLines.voltageClass, voltageClass.toLowerCase()));
    if (owner) conditions.push(ilike(transmissionLines.owner, `%${owner}%`));
    if (status) conditions.push(eq(transmissionLines.status, status.toUpperCase()));
    if (minVoltage) {
      const min = parseFloat(minVoltage);
      if (isNaN(min)) throw new ApiError("BAD_REQUEST", "minVoltage must be a valid number");
      conditions.push(gte(transmissionLines.voltage, min));
    }
    if (maxVoltage) {
      const max = parseFloat(maxVoltage);
      if (isNaN(max)) throw new ApiError("BAD_REQUEST", "maxVoltage must be a valid number");
      conditions.push(lte(transmissionLines.voltage, max));
    }
    if (search) {
      conditions.push(or(ilike(transmissionLines.owner, `%${search}%`), ilike(transmissionLines.sub1, `%${search}%`), ilike(transmissionLines.sub2, `%${search}%`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(transmissionLines).where(where).orderBy(transmissionLines.objectId).limit(limit);
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(transmissionLines).where(where);
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
