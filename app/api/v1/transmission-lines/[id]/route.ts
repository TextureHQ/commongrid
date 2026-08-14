/**
 * GET /api/v1/transmission-lines/:id
 *
 * Fetch a single transmission line by ID. Returns 404 if not found.
 */

import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { loadTransmissionLineById } from "@/lib/data/transmission-lines";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;

  return withApiMiddleware(async (_r: Request, _ctx: RouteContext) => {
    const line = await loadTransmissionLineById(id);

    if (!line) {
      throw new ApiError("NOT_FOUND", `Transmission line '${id}' not found`);
    }

    return jsonResponse({ data: stripInternal(line) }, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `transmission-line:${id}`,
    });
  })(req, { requestId: "" });
}
