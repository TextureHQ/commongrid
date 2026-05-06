/**
 * GET /api/v1/ev-stations/:slug
 *
 * Fetch a single EV station by slug. Returns 404 if not found.
 */

import {
  ApiError,
  jsonResponse,
  type RouteContext,
  withCors,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { loadEVStationBySlug } from "@/lib/data/ev-stations";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(
        withCors(async (_r: Request, _ctx: RouteContext) => {
          const station = await loadEVStationBySlug(slug);

          if (!station) {
            throw new ApiError("NOT_FOUND", `EV station '${slug}' not found`);
          }

          return jsonResponse({ data: stripInternal(station) }, 200, {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
            "Cache-Tag": `ev-station:${slug}`,
          });
        })
      )
    )
  )(req, { requestId: "" });
}
