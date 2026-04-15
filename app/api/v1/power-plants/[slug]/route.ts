import { NextRequest } from "next/server";
import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PowerPlantRecord = Record<string, any>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = generateRequestId();
  try {
    const { slug } = await params;
    if (getDataSource("powerPlants") === "json") {
      const data: PowerPlantRecord[] = (await import("@/data/power-plants.json")).default;
      const plant = data.find((p) => p.slug === slug || p.id === slug);
      if (!plant) throw new ApiError("NOT_FOUND", `Power plant '${slug}' not found`);
      return withCors(jsonResponse({ data: plant }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }
    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");
    const { powerPlants } = await import("@/lib/db/schema/power-plants");
    const { eq, or } = await import("drizzle-orm");
    const rows = await db.select().from(powerPlants).where(or(eq(powerPlants.slug, slug), eq(powerPlants.id, slug))).limit(1);
    if (rows.length === 0) throw new ApiError("NOT_FOUND", `Power plant '${slug}' not found`);
    return withCors(jsonResponse({ data: rows[0] }, 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
  } catch (error) {
    if (error instanceof ApiError) return withCors(jsonResponse(formatError(error, requestId), error.status, { "X-Request-Id": requestId }));
    console.error(`[${requestId}] Unexpected error:`, error);
    return withCors(jsonResponse(formatError(new ApiError("INTERNAL_ERROR", "An unexpected error occurred"), requestId), 500, { "X-Request-Id": requestId }));
  }
}
