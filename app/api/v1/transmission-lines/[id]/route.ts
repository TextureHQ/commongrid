/**
 * GET /api/v1/transmission-lines/:id
 *
 * Fetch a single transmission line by ID. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_TRANSMISSION.
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
import { loadTransmissionLineById } from "@/lib/data/transmission-lines";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(withCors(async (r: Request, _ctx: RouteContext) => {
        const line = await loadTransmissionLineById(id);

        if (!line) {
          throw new ApiError("NOT_FOUND", `Transmission line '${id}' not found`);
        }

        return jsonResponse({ data: line }, 200, {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          "Cache-Tag": `transmission-line:${id}`,
        });
      }))
    )
  )(req, { requestId: "" });
}
