/**
 * GET /api/v1/substations/[slug]/transmission-lines
 *
 * List transmission lines connected to a specific substation.
 * Uses the transmission_line_endpoints join table to find all connected lines.
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
import { loadSubstationTransmissionLinesBySlug } from "@/lib/data/substations-api";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(
        withCors(async (_r: Request, _ctx: RouteContext) => {
          const result = await loadSubstationTransmissionLinesBySlug(slug);

          if (!result) {
            throw new ApiError("NOT_FOUND", `Substation '${slug}' not found`);
          }

          return jsonResponse({ data: result.lines }, 200, {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
            "Cache-Tag": `substation:${slug}:transmission-lines`,
          });
        })
      )
    )
  )(req, { requestId: "" });
}
