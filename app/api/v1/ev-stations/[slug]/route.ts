import { NextRequest } from "next/server";
import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EVStationRecord = Record<string, any>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = generateRequestId();
  try {
    const { slug } = await params;
    if (getDataSource("evStations") === "json") {
      const data: EVStationRecord[] = (await import("@/data/ev-charging.json")).default;
      const station = data.find((s) => s.slug === slug || s.id === slug);
      if (!station) throw new ApiError("NOT_FOUND", `EV station '${slug}' not found`);
      return withCors(jsonResponse({ data: station }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }
    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");
    const { evStations } = await import("@/lib/db/schema/ev-stations");
    const { eq, or } = await import("drizzle-orm");
    const rows = await db.select().from(evStations).where(or(eq(evStations.slug, slug), eq(evStations.id, slug))).limit(1);
    if (rows.length === 0) throw new ApiError("NOT_FOUND", `EV station '${slug}' not found`);
    return withCors(jsonResponse({ data: rows[0] }, 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
  } catch (error) {
    if (error instanceof ApiError) return withCors(jsonResponse(formatError(error, requestId), error.status, { "X-Request-Id": requestId }));
    console.error(`[${requestId}] Unexpected error:`, error);
    return withCors(jsonResponse(formatError(new ApiError("INTERNAL_ERROR", "An unexpected error occurred"), requestId), 500, { "X-Request-Id": requestId }));
  }
}
