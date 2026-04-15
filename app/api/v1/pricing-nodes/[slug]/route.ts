/**
 * GET /api/v1/pricing-nodes/:slug
 *
 * Fetch a single pricing node by slug. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_PRICING_NODES.
 */

import {
  ApiError,
  withErrorHandling,
  withRequestId,
  withTiming,
  jsonResponse,
  generateRequestId,
  type RouteContext,
} from "@/lib/api";
import { corsHeaders } from "@/lib/api/cors";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext): Promise<Response> {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const node = await loadPricingNodeBySlug(slug);

  if (!node) {
    throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);
  }

  return jsonResponse({ data: node }, 200, {
    ...corsHeaders(),
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    "Cache-Tag": `pricing-node:${slug}`,
  });
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
