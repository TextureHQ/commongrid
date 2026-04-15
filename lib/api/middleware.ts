/**
 * Composable middleware for CommonGrid API routes.
 *
 * Each `with*` function wraps a RouteHandler, adding cross-cutting concerns
 * (request IDs, error handling, timing, CORS) without coupling routes to
 * framework-specific middleware infrastructure.
 *
 * `withApiMiddleware` is the single convenience wrapper that route handlers
 * should use — it composes all layers in the correct order.
 *
 * See docs/specs/persistence-api.md §4.10 and §12.4.
 */

import { ApiError, formatError } from "./errors";
import type { RouteContext, RouteHandler } from "./types";
import { withCors } from "./cors";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "./rate-limit";
import { validateApiKey } from "./auth";

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
// Composed middleware
// ---------------------------------------------------------------------------

export interface ApiMiddlewareOptions {
  /** When true, requests without a valid Bearer key receive 401. */
  requireAuth?: boolean;
  /** Resource name used for scope validation (e.g., "utilities"). */
  resource?: string;
  /** Action name used for scope validation (e.g., "read", "write"). */
  action?: string;
  /**
   * Enable rate limiting. Defaults to true.
   * Set to false only for health-check / internal endpoints.
   */
  rateLimit?: boolean;
}

/**
 * Single wrapper for API route handlers.
 *
 * Layer order (outer → inner):
 *   withErrorHandling → withRequestId → withTiming → withCors
 *   → rate limiting → auth → handler
 *
 * Rate-limit headers are appended to every successful response.
 */
export function withApiMiddleware(
  handler: RouteHandler,
  options: ApiMiddlewareOptions = {}
): RouteHandler {
  const { requireAuth = false, resource = "", action = "", rateLimit = true } =
    options;

  const core: RouteHandler = async (
    req: Request,
    ctx: RouteContext
  ): Promise<Response> => {
    const authHeader = req.headers.get("Authorization");
    const isAuthenticated = !!authHeader;
    const method = req.method;
    const isWrite =
      method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      method === "DELETE";
    const isBulk = new URL(req.url).pathname.includes("/bulk");

    // ── Rate limiting ──────────────────────────────────────────────────────
    let rlResult: Awaited<ReturnType<typeof checkRateLimit>> | null = null;

    if (rateLimit) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const identifier = isAuthenticated ? `auth:${authHeader}` : `ip:${ip}`;

      rlResult = await checkRateLimit(identifier, isAuthenticated, isWrite, isBulk);

      if (!rlResult.success) {
        return rateLimitResponse(rlResult, ctx.requestId);
      }
    }

    // ── Authentication ─────────────────────────────────────────────────────
    if (requireAuth) {
      const authResult = await validateApiKey(authHeader, resource, action);
      if (!authResult.valid) {
        return Response.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: authResult.error ?? "Unauthorized",
              request_id: ctx.requestId,
              timestamp: new Date().toISOString(),
            },
          },
          {
            status: 401,
            headers: { "X-Request-Id": ctx.requestId },
          }
        );
      }
    }

    // ── Handler ────────────────────────────────────────────────────────────
    const response = await handler(req, ctx);

    // Attach rate-limit headers to the outgoing response.
    if (rlResult) {
      for (const [key, value] of Object.entries(rateLimitHeaders(rlResult))) {
        response.headers.set(key, value);
      }
    }

    return response;
  };

  return withErrorHandling(withRequestId(withTiming(withCors(core))));
}
