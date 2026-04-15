import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Program = Record<string, any>;

/**
 * GET /api/v1/programs
 *
 * List programs with filtering and search.
 * Supports dual-mode: JSON fallback or database via feature flags.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    if (getDataSource("programs") === "json") {
      const data: Program[] = (await import("@/data/programs.json")).default;
      let filtered = data;

      if (status) filtered = filtered.filter((p) => p.status?.toLowerCase() === status.toLowerCase());
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
      }

      const total = filtered.length;
      const page = filtered.slice(0, limit);
      return withCors(jsonResponse(paginatedResponse(page, total, null, limit), 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { programs } = await import("@/lib/db/schema/programs");
    const { eq, ilike, and, or, sql } = await import("drizzle-orm");

    const conditions = [];
    if (status) conditions.push(eq(programs.status, status.toUpperCase()));
    if (search) {
      conditions.push(or(ilike(programs.name, `%${search}%`), ilike(programs.description, `%${search}%`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(programs).where(where).orderBy(programs.name).limit(limit);
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(programs).where(where);
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
