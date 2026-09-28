/**
 * GET /api/v1/rates/:slug
 *
 * Fetch a single rate structure by its CommonGrid slug. Returns 404 when
 * the slug does not exist or has been soft-deleted.
 */

import type { NextRequest } from "next/server";
import { ApiError, jsonResponse, withApiMiddleware } from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { loadRateBySlug } from "@/lib/data/rate-structures";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async () => {
    const rate = await loadRateBySlug(slug);

    if (!rate) {
      throw new ApiError("NOT_FOUND", `Rate '${slug}' not found`);
    }

    return jsonResponse({ data: stripInternal(rate) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `rate:${rate.slug}`,
    });
  })(req, { requestId: "" });
}
