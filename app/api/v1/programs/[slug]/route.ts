import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Program = Record<string, any>;

/**
 * GET /api/v1/programs/:slug
 *
 * Get a single program by slug or ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = generateRequestId();

  try {
    const { slug } = await params;

    if (getDataSource("programs") === "json") {
      const data: Program[] = (await import("@/data/programs.json")).default;
      const program = data.find((p) => p.slug === slug || p.id === slug);
      if (!program) throw new ApiError("NOT_FOUND", `Program '${slug}' not found`);
      return withCors(jsonResponse({ data: program }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { programs } = await import("@/lib/db/schema/programs");
    const { eq, or } = await import("drizzle-orm");

    const rows = await db.select().from(programs).where(or(eq(programs.slug, slug), eq(programs.id, slug))).limit(1);
    if (rows.length === 0) throw new ApiError("NOT_FOUND", `Program '${slug}' not found`);

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
