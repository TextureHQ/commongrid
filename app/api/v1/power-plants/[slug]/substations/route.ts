/**
 * GET /api/v1/power-plants/[slug]/substations
 *
 * List substations connected to a specific power plant (interconnection points).
 * Uses the power_plant_interconnections join table to find nearest substations.
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { loadPowerPlantInterconnectionsBySlug } from "@/lib/data/power-plants-api";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async (_r: Request, _ctx: RouteContext) => {
    const result = await loadPowerPlantInterconnectionsBySlug(slug);

    if (!result) {
      throw new ApiError("NOT_FOUND", `Power plant '${slug}' not found`);
    }

    return jsonResponse({ data: result.interconnections }, 200, {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      "Cache-Tag": `power-plant:${slug}:substations`,
    });
  })(req, { requestId: "" });
}
