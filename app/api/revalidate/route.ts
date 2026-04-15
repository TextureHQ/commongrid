/**
 * POST /api/revalidate
 *
 * Trigger on-demand cache revalidation for a given cache tag.
 * Requires a valid API key with the 'cache:revalidate' scope.
 *
 * Request body: { tag: string }
 * Response: { revalidated: true, tag: string }
 */

import { revalidateTag } from "next/cache";
import { z } from "zod";

import {
  ApiError,
  jsonResponse,
  type RouteContext,
  withCors,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { validateApiKey } from "@/lib/api/auth";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  tag: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return withRequestId(
    withErrorHandling(
      withTiming(
        withCors(async (r: Request, _ctx: RouteContext) => {
          // Require authentication with cache:revalidate scope
          const auth = await validateApiKey(r.headers.get("authorization"), "cache", "revalidate");
          if (!auth.valid) {
            throw new ApiError("UNAUTHORIZED", auth.error ?? "Invalid API key");
          }

          // Parse and validate request body
          let body: unknown;
          try {
            body = await r.json();
          } catch {
            throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
          }

          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            throw new ApiError("VALIDATION_ERROR", "Invalid request body", {
              issues: parsed.error.issues,
            });
          }

          const { tag } = parsed.data;

          revalidateTag(tag);

          return jsonResponse({ revalidated: true, tag }, 200);
        })
      )
    )
  )(req, { requestId: "" });
}
