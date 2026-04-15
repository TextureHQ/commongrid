import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { generateRequestId, withCors } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { ApiError, formatError } from "@/lib/api/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PricingNode = Record<string, any>;

/**
 * GET /api/v1/pricing-nodes/:slug
 *
 * Get a single pricing node by slug or ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = generateRequestId();

  try {
    const { slug } = await params;

    if (getDataSource("pricingNodes") === "json") {
      const data: PricingNode[] = (await import("@/data/pricing-nodes.json")).default;
      const node = data.find((n) => n.slug === slug || n.id === slug);
      if (!node) throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);
      return withCors(jsonResponse({ data: node }, 200, { "X-Request-Id": requestId, "X-Data-Source": "json" }));
    }

    const { db } = await import("@/lib/db/client");
    if (!db) throw new ApiError("SERVICE_UNAVAILABLE", "Database not configured");

    const { pricingNodes } = await import("@/lib/db/schema/pricing-nodes");
    const { eq, or } = await import("drizzle-orm");

    const rows = await db.select().from(pricingNodes).where(or(eq(pricingNodes.slug, slug), eq(pricingNodes.id, slug))).limit(1);
    if (rows.length === 0) throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);

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
