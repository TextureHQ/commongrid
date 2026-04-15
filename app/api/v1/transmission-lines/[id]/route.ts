import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransmissionLine = Record<string, any>;

/**
 * GET /api/v1/transmission-lines/:id
 *
 * Get a single transmission line by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const { id } = await params;

    if (getDataSource("transmissionLines") === "json") {
      const data: TransmissionLine[] = (await import("@/data/transmission-lines.json")).default;
      const line = data.find((t) => t.id === id);
      if (!line) throw new ApiError("NOT_FOUND", `Transmission line '${id}' not found`);
      return withCors(jsonResponse({ data: line }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { transmissionLines } = await import("@/lib/db/schema/transmission-lines");
    const { eq } = await import("drizzle-orm");

    const rows = await db.select().from(transmissionLines).where(eq(transmissionLines.id, id)).limit(1);
    if (rows.length === 0) throw new ApiError("NOT_FOUND", `Transmission line '${id}' not found`);

    return withCors(jsonResponse({ data: rows[0] }, 200, { "X-Request-Id": requestId, "X-Data-Source": "database" }));
  } catch (error) {
    if (error instanceof ApiError) {
      return withCors(jsonResponse(formatError(error, requestId), error.status, { "X-Request-Id": requestId }));
    }
    console.error(`[${requestId}] Unexpected error:`, error);
    const internal = new ApiError("INTERNAL_ERROR", "An unexpected error occurred");
    return withCors(jsonResponse(formatError(internal, requestId), 500, { "X-Request-Id": requestId }));
  }
}
