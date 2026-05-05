/**
 * GET /api/v1/substations/:slug
 *
 * Fetch a single substation by slug. Returns 404 if not found.
 * Includes all detail fields and related metadata.
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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(
        withCors(async (_r: Request, _ctx: RouteContext) => {
          const substation = await loadSubstationBySlug(slug);

          if (!substation) {
            throw new ApiError("NOT_FOUND", `Substation '${slug}' not found`);
          }

          return jsonResponse({ data: substation }, 200, {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
            "Cache-Tag": `substation:${slug}`,
          });
        })
      )
    )
  )(req, { requestId: "" });
}
