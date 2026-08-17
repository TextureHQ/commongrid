/**
 * GET /api/v1/programs/:slug
 *
 * Fetch a single program by slug. Returns 404 if not found.
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
import { loadProgramBySlug } from "@/lib/data/programs";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withApiMiddleware(async (r: Request, _ctx: RouteContext) => {
    const at = parseAtParam(new URL(r.url).searchParams);
    const program = await loadProgramBySlug(slug);

    if (!program) {
      throw new ApiError("NOT_FOUND", `Program '${slug}' not found`);
    }

    const headers = {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "Cache-Tag": `program:${slug}`,
    };

    if (at) {
      return pointInTimeJsonResponse({
        entityType: "program",
        entityId: program.id,
        at,
        label: "Program",
        slug,
        headers,
      });
    }

    return jsonResponse({ data: stripInternal(program) }, 200, headers);
  })(req, { requestId: "" });
}
