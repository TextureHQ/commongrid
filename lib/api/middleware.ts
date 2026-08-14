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

import * as Sentry from "@sentry/nextjs";
import { validateApiKey } from "./auth";
import { withCors } from "./cors";
import { ApiError, formatError } from "./errors";
import { checkRateLimit, rateLimitHeaders, rateLimitResponse } from "./rate-limit";
import type { RouteContext, RouteHandler } from "./types";
import { normalizeEndpoint, trackUsage } from "./usage-tracker";

function unauthorizedResponse(message: string, requestId: string | undefined): Response {
  const id = requestId ?? generateRequestId();
  return Response.json(formatError(new ApiError("UNAUTHORIZED", message), id), {
    status: 401,
    headers: { "X-Request-Id": id },
  });
}

function usageTier(rlTier: string | undefined, isAuthenticated: boolean): "anonymous" | "registered" | "bulk" {
  if (rlTier === "write") return isAuthenticated ? "registered" : "anonymous";
  if (rlTier === "bulk" || rlTier === "registered" || rlTier === "anonymous") return rlTier;
  return isAuthenticated ? "registered" : "anonymous";
}

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
 * Report a server-side API failure to Sentry with request context attached.
 *
 * Client-caused failures (4xx — validation errors, 404s, bad API keys) are
 * deliberately *not* reported: they are expected traffic on a public API and
 * would drown out real defects. Anything that produces a 5xx is a bug on our
 * side and always gets reported.
 */
function reportServerError(err: unknown, req: Request, requestId: string, code: string): void {
  let pathname = "unknown";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    // A malformed request URL is itself worth knowing about, but must not
    // prevent the error from being reported.
  }

  Sentry.withScope((scope) => {
    scope.setTag("api.error_code", code);
    scope.setTag("api.route", pathname);
    scope.setTag("http.method", req.method);
    scope.setTag("request_id", requestId);
    scope.setContext("request", {
      method: req.method,
      pathname,
      request_id: requestId,
    });
    Sentry.captureException(err);
  });
}

/**
 * Middleware: catches thrown errors and returns a structured JSON error
 * response. Known `ApiError`s map to their status code; unknown errors
 * become 500 INTERNAL_ERROR.
 *
 * Every 5xx is also reported to Sentry — previously these were only written to
 * `console.error`, which meant production API failures were invisible outside
 * of Vercel's log retention window.
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const requestId = ctx.requestId ?? generateRequestId();

      if (err instanceof ApiError) {
        console.error(`[${requestId}] ApiError ${err.code}: ${err.message}`);
        if (err.status >= 500) {
          reportServerError(err, req, requestId, err.code);
        }
        return Response.json(formatError(err, requestId), {
          status: err.status,
          headers: { "X-Request-Id": requestId },
        });
      }

      // Unexpected error — log the full stack, report it, return a safe message.
      console.error(`[${requestId}] Unexpected error:`, err);
      reportServerError(err, req, requestId, "INTERNAL_ERROR");
      const internal = new ApiError("INTERNAL_ERROR", "An unexpected error occurred");
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
      console.warn(`[${ctx.requestId ?? "?"}] Slow request: ${req.method} ${url} took ${ms}ms`);
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
  /**
   * Enable usage tracking. Defaults to true.
   * Set to false for internal / health-check endpoints.
   */
  trackUsage?: boolean;
}

/**
 * Single wrapper for API route handlers.
 *
 * Layer order (outer → inner):
 *   withErrorHandling → withRequestId → withTiming → withCors
 *   → auth → rate limiting → handler → usage tracking (fire-and-forget)
 *
 * Auth runs before rate limiting so only validated keys receive the
 * registered/bulk budget. Present-but-invalid credentials return 401.
 *
 * Rate-limit headers are appended to every successful response.
 * Usage events are recorded asynchronously and never block the response.
 */
export function withApiMiddleware(handler: RouteHandler, options: ApiMiddlewareOptions = {}): RouteHandler {
  const {
    requireAuth = false,
    resource = "",
    action = "",
    rateLimit = true,
    trackUsage: enableTracking = true,
  } = options;

  const core: RouteHandler = async (req: Request, ctx: RouteContext): Promise<Response> => {
    const start = performance.now();
    const authHeader = req.headers.get("Authorization");
    const method = req.method;
    const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    const isBulk = new URL(req.url).pathname.includes("/bulk");

    // Track API key ID for usage events (set during auth validation)
    let isAuthenticated = false;
    let apiKeyId: string | null = null;
    let keyTier: string | undefined;

    // ── Authentication ─────────────────────────────────────────────────────
    // Credentials, when present, are always looked up. Only known active keys
    // elevate to registered/bulk. Unknown / revoked / malformed tokens get 401
    // — they must not elevate tier and must not silently fall back to anonymous.
    // Missing Authorization remains anonymous on public routes.
    if (authHeader || requireAuth) {
      const authResult = await validateApiKey(authHeader, requireAuth ? resource : "", requireAuth ? action : "");
      if (!authResult.valid) {
        return unauthorizedResponse(authResult.error ?? "Unauthorized", ctx.requestId);
      }
      isAuthenticated = true;
      apiKeyId = authResult.apiKeyId ?? null;
      keyTier = authResult.tier;
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    let rlResult: Awaited<ReturnType<typeof checkRateLimit>> | null = null;

    if (rateLimit) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const identifier = isAuthenticated && apiKeyId ? `auth:${apiKeyId}` : `ip:${ip}`;

      rlResult = await checkRateLimit(identifier, isAuthenticated, isWrite, isBulk, keyTier);

      if (!rlResult.success) {
        // Track the 429 event
        if (enableTracking) {
          const elapsed = performance.now() - start;
          trackUsage({
            endpoint: normalizeEndpoint(req.url),
            method,
            statusCode: 429,
            responseTimeMs: Math.round(elapsed),
            isAuthenticated,
            tier: usageTier(rlResult.tier, isAuthenticated),
            apiKeyId,
          });
        }
        return rateLimitResponse(rlResult, ctx.requestId);
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

    // ── Usage tracking (fire-and-forget) ───────────────────────────────────
    if (enableTracking) {
      const elapsed = performance.now() - start;
      trackUsage({
        endpoint: normalizeEndpoint(req.url),
        method,
        statusCode: response.status,
        responseTimeMs: Math.round(elapsed),
        isAuthenticated,
        tier: usageTier(rlResult?.tier, isAuthenticated),
        apiKeyId,
      });
    }

    return response;
  };

  return withErrorHandling(withRequestId(withTiming(withCors(core))));
}
