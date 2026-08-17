/**
 * GET /api/v1/ev-stations/:slug
 *
 * Fetch a single EV station by slug. Returns 404 if not found.
 */

import {
  ApiError,
  jsonResponse,
  parseAtParam,
  pointInTimeJsonResponse,
  type RouteContext,
  withApiMiddleware,
} from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { dbRowToEVStation, loadEVStationBySlug } from "@/lib/data/ev-stations";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const at = parseAtParam(new URL(r.url).searchParams);
    const station = await loadEVStationBySlug(slug);

    if (!station) {
      throw new ApiError("NOT_FOUND", `EV station '${slug}' not found`);
    }

    const headers = {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `ev-station:${slug}`,
    };

    if (at) {
      return pointInTimeJsonResponse({
        entityType: "ev_station",
        entityId: station.id,
        at,
        label: "EV station",
        slug,
        headers,
        transform: dbRowToEVStation,
      });
    }

    return jsonResponse({ data: stripInternal(station) }, 200, headers);
  })(req, { requestId: "" });
}
