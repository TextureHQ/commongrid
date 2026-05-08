/**
 * CORS configuration for CommonGrid API routes.
 *
 * Read endpoints (GET / HEAD / OPTIONS): `Access-Control-Allow-Origin: *`.
 * The public v1 API is read-only for anonymous clients and is explicitly
 * meant to be consumed from third-party applications, research tools,
 * mapping frontends, and server-to-server integrations. Wildcard CORS
 * matches the documented "public, cacheable, any consumer" posture.
 *
 * Write endpoints (POST / PATCH / DELETE): scoped to `https://commongrid.info`.
 * Community contributions + moderation flows ship through first-party UI
 * paths and go through Clerk session auth rather than CORS; allowing
 * cross-origin writes would just invite accidental misuse without
 * unlocking a legitimate use case.
 *
 * Handles OPTIONS preflight automatically when used via withCors().
 *
 * See docs/specs/persistence-api.md §12.4.
 */

import type { RouteContext, RouteHandler } from "./types";

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Returns the CORS headers that must be present on every API response.
 *
 * Read responses (`*` in the Origin header) are safe to share across origins.
 * Write origins are intentionally not widened — see the module comment.
 */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/**
 * Returns CORS headers for routes that accept writes from our own first-party UI.
 *
 * Used by contribution + moderation + follows + discussions routes — anywhere
 * POST/PATCH/DELETE is exposed. Browser writes from third-party origins are
 * intentionally rejected.
 */
export function corsWriteHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "https://commongrid.info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

// ---------------------------------------------------------------------------
// Handler wrapper
// ---------------------------------------------------------------------------

/**
 * Middleware: wraps a route handler to add CORS headers and handle
 * OPTIONS preflight requests automatically.
 *
 * OPTIONS returns 204 No Content with CORS headers and no body.
 * All other methods receive CORS headers on the response.
 */
export function withCors(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    const headers = corsHeaders();

    // Handle OPTIONS preflight — return immediately, no auth/rate-limit needed.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const response = await handler(req, ctx);

    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    return response;
  };
}
