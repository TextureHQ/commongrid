/**
 * GET /api/v1/substations/:slug
 *
 * Fetch a single substation by slug. Returns 404 if not found.
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
import { loadSubstationBySlug } from "@/lib/data/substations-api";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(
        withCors(async (_r: Request, _ctx: RouteContext) => {
          const row = await loadSubstationBySlug(slug);

          if (!row) {
            throw new ApiError("NOT_FOUND", `Substation '${slug}' not found`);
          }

          return jsonResponse({ data: row }, 200, {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
            "Cache-Tag": `substation:${slug}`,
          });
        })
      )
    )
  )(req, { requestId: "" });
}
