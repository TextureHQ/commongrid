/**
 * GET /api/v1/power-plants/:slug
 *
 * Fetch a single power plant by slug. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_POWER_PLANTS.
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
import { loadPowerPlantBySlug } from "@/lib/data/power-plants-api";

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
      withTiming(withCors(async (r: Request, _ctx: RouteContext) => {
        const plant = await loadPowerPlantBySlug(slug);

        if (!plant) {
          throw new ApiError("NOT_FOUND", `Power plant '${slug}' not found`);
        }

        return jsonResponse({ data: plant }, 200, {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          "Cache-Tag": `power-plant:${slug}`,
        });
      }))
    )
  )(req, { requestId: "" });
}
