/**
 * CORS configuration for CommonGrid API routes.
 *
 * Production:   Access-Control-Allow-Origin: https://commongrid.info
 * Development:  Access-Control-Allow-Origin: *
 *
 * Handles OPTIONS preflight automatically when used via withCors().
 *
 * See docs/specs/persistence-api.md §12.4.
 */

import type { RouteContext, RouteHandler } from "./types";

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** Returns the CORS headers that must be present on every API response. */
export function corsHeaders(): Record<string, string> {
  const origin = process.env.NODE_ENV === "production" ? "https://commongrid.info" : "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
