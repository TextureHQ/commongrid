/**
 * Composable middleware for CommonGrid API routes.
 *
 * Each `with*` function wraps a RouteHandler, adding cross-cutting concerns
 * (request IDs, error handling, timing, CORS) without coupling routes to
 * framework-specific middleware infrastructure.
 *
 * See docs/specs/persistence-api.md §4.10 and §12.4.
 */

import { ApiError, formatError } from "./errors";
import type { RouteContext, RouteHandler } from "./types";

// ---------------------------------------------------------------------------
// Request ID
// ---------------------------------------------------------------------------

/** Generate a short, unique request identifier. */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID().slice(0, 12)}`;
}

/**
 * Middleware: attaches a unique `X-Request-Id` header to every response and
 * injects `requestId` into the route context.
 */
export function withRequestId(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext) => {
    const requestId = generateRequestId();
    const response = await handler(req, { ...ctx, requestId });
    response.headers.set("X-Request-Id", requestId);
    return response;
  };
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Middleware: catches thrown errors and returns a structured JSON error
 * response. Known `ApiError`s map to their status code; unknown errors
 * become 500 INTERNAL_ERROR.
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const requestId = ctx.requestId ?? generateRequestId();

      if (err instanceof ApiError) {
        console.error(
          `[${requestId}] ApiError ${err.code}: ${err.message}`
        );
        return Response.json(formatError(err, requestId), {
          status: err.status,
          headers: { "X-Request-Id": requestId },
        });
      }

      // Unexpected error — log the full stack, return a safe message.
      console.error(`[${requestId}] Unexpected error:`, err);
      const internal = new ApiError(
        "INTERNAL_ERROR",
        "An unexpected error occurred"
      );
      return Response.json(formatError(internal, requestId), {
        status: 500,
        headers: { "X-Request-Id": requestId },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * Middleware: measures handler execution time and sets `X-Response-Time`.
 * Logs a warning when a request takes longer than 200 ms.
 */
export function withTiming(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext) => {
    const start = performance.now();
    const response = await handler(req, ctx);
    const elapsed = performance.now() - start;
    const ms = elapsed.toFixed(1);

    response.headers.set("X-Response-Time", `${ms}ms`);

    if (elapsed > 200) {
      const url = new URL(req.url).pathname;
      console.warn(
        `[${ctx.requestId ?? "?"}] Slow request: ${req.method} ${url} took ${ms}ms`
      );
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/** CORS headers per §12.4 — restrictive in production, permissive in dev. */
export function withCors(response: Response): Response {
  const origin =
    process.env.NODE_ENV === "production"
      ? "https://commongrid.info"
      : "*";

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  return response;
}
