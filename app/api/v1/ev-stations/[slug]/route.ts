/**
 * GET /api/v1/ev-stations/:slug
 *
 * Fetch a single EV station by slug. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_EV_STATIONS.
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
import { loadEVStationBySlug } from "@/lib/data/ev-stations";

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
        const station = await loadEVStationBySlug(slug);

        if (!station) {
          throw new ApiError("NOT_FOUND", `EV station '${slug}' not found`);
        }

        return jsonResponse({ data: station }, 200, {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          "Cache-Tag": `ev-station:${slug}`,
        });
      }))
    )
  )(req, { requestId: "" });
}
