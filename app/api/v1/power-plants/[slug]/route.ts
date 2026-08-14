/**
 * GET /api/v1/power-plants/:slug
 *
 * Fetch a single power plant. The path segment accepts either:
 *
 *   - the CommonGrid slug   → /api/v1/power-plants/59th-street-ny
 *   - the EIA plant code    → /api/v1/power-plants/2503
 *
 * EIA plant codes are the industry-standard identifier for a generating
 * facility (EIA-860/860M/923 filings, ISO/RTO node registries, and most
 * third-party grid datasets all key on them), so accepting them directly
 * saves every consumer from having to maintain a code→slug crosswalk.
 * Plant codes are pure digits and slugs always contain letters, so the two
 * namespaces can't collide.
 *
 * When resolved via plant code, the response carries a
 * `Link: </api/v1/power-plants/{slug}>; rel="canonical"` header so callers,
 * caches, and crawlers can converge on the canonical slug URL.
 *
 * Returns 404 if not found.
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { isPlantCode, loadPowerPlantByPlantCode, loadPowerPlantBySlug } from "@/lib/data/power-plants-api";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async (_r: Request, _ctx: RouteContext) => {
    const byPlantCode = isPlantCode(slug);
    const plant = byPlantCode ? await loadPowerPlantByPlantCode(slug) : await loadPowerPlantBySlug(slug);

    if (!plant) {
      throw new ApiError(
        "NOT_FOUND",
        byPlantCode ? `Power plant with EIA plant code '${slug}' not found` : `Power plant '${slug}' not found`
      );
    }

    const headers: Record<string, string> = {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `power-plant:${plant.slug}`,
    };

    if (byPlantCode) {
      headers.Link = `</api/v1/power-plants/${plant.slug}>; rel="canonical"`;
    }

    return jsonResponse({ data: stripInternal(plant) }, 200, headers);
  })(req, { requestId: "" });
}
