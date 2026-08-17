/**
 * GET /api/v1/pricing-nodes/:slug
 *
 * Fetch a single pricing node by slug. Returns 404 if not found.
 */

import {
  ApiError,
  corsHeaders,
  jsonResponse,
  parseAtParam,
  pointInTimeJsonResponse,
  type RouteContext,
  withApiMiddleware,
} from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const at = parseAtParam(new URL(r.url).searchParams);
    const node = await loadPricingNodeBySlug(slug);

    if (!node) {
      throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);
    }

    const headers = {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `pricing-node:${slug}`,
      ...corsHeaders(),
    };

    if (at) {
      return pointInTimeJsonResponse({
        entityType: "pricing_node",
        entityId: node.id,
        at,
        label: "Pricing node",
        slug,
        headers,
      });
    }

    return jsonResponse({ data: stripInternal(node) }, 200, headers);
  })(req, { requestId: "" });
}
