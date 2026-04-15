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
  withCors,
  jsonResponse,
  type RouteContext,
} from "@/lib/api";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(async (r: Request, _ctx: RouteContext) => {
        const node = await loadPricingNodeBySlug(slug);

        if (!node) {
          throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);
        }

        return withCors(
          jsonResponse({ data: node }, 200, {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
            "Cache-Tag": `pricing-node:${slug}`,
          })
        );
      })
    )
  )(req, { requestId: "" });
}
