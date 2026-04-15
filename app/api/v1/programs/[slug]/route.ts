/**
 * GET /api/v1/programs/:slug
 *
 * Fetch a single program by slug. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_PROGRAMS.
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
import { loadProgramBySlug } from "@/lib/data/programs";

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
        const program = await loadProgramBySlug(slug);

        if (!program) {
          throw new ApiError("NOT_FOUND", `Program '${slug}' not found`);
        }

        return jsonResponse({ data: program }, 200, {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          "Cache-Tag": `program:${slug}`,
        });
      }))
    )
  )(req, { requestId: "" });
}
