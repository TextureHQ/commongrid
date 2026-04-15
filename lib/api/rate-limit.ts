/**
 * Distributed rate limiting for CommonGrid API routes.
 *
 * Uses Upstash Redis with a sliding-window algorithm. When
 * UPSTASH_REDIS_REST_URL is absent (e.g., local dev) all limits pass
 * through so the app still works without Redis configured.
 *
 * Tiers (requests per minute):
 *   unauthenticated  100 / min  — public read traffic by IP
 *   authenticated   1000 / min  — keyed read traffic
 *   write            100 / min  — any mutating request
 *   bulk              10 / min  — /bulk endpoints
 *
 * See docs/specs/persistence-api.md §5.4.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Unix timestamp (seconds) at which the window resets. */
  reset: number;
  limit: number;
};

// ---------------------------------------------------------------------------
// Limiter factory
// ---------------------------------------------------------------------------

interface RateLimiters {
  unauthenticated: Ratelimit;
  authenticated: Ratelimit;
  write: Ratelimit;
  bulk: Ratelimit;
}

/**
 * Build all four rate-limiter instances backed by a single Redis connection.
 * Returns null when UPSTASH_REDIS_REST_URL is not set.
 */
export function createRateLimiter(): RateLimiters | null {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  const redis = Redis.fromEnv();

  return {
    unauthenticated: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "cg:rl:unauth",
    }),
    authenticated: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1000, "1 m"),
      prefix: "cg:rl:auth",
    }),
    write: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "cg:rl:write",
    }),
    bulk: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "cg:rl:bulk",
    }),
  };
}

// Lazily initialised singleton — avoids creating Redis connections at import
// time (important for Next.js build/static generation).
let _limiters: RateLimiters | null | undefined;

function getLimiters(): RateLimiters | null {
  if (_limiters === undefined) {
    _limiters = createRateLimiter();
  }
  return _limiters;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

/**
 * Apply the appropriate rate-limit tier for a request.
 *
 * `identifier` should be an IP address or hashed key string. When Redis
 * is not configured the function returns a permissive pass-through result.
 */
export async function checkRateLimit(
  identifier: string,
  isAuthenticated: boolean,
  isWrite: boolean,
  isBulk: boolean
): Promise<RateLimitResult> {
  const limiters = getLimiters();

  if (!limiters) {
    // Dev fallback — no Redis configured.
    return { success: true, remaining: 999, reset: 0, limit: 999 };
  }

  let tier: keyof RateLimiters;
  if (isBulk) {
    tier = "bulk";
  } else if (isWrite) {
    tier = "write";
  } else if (isAuthenticated) {
    tier = "authenticated";
  } else {
    tier = "unauthenticated";
  }

  const result = await limiters[tier].limit(identifier);

  return {
    success: result.success,
    remaining: result.remaining,
    // Upstash returns reset as ms; convert to seconds for headers.
    reset: Math.ceil(result.reset / 1000),
    limit: result.limit,
  };
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** Standard rate-limit response headers. */
export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}

/** Build a 429 response with Retry-After and rate-limit headers. */
export function rateLimitResponse(
  result: RateLimitResult,
  requestId: string
): Response {
  const nowSecs = Math.floor(Date.now() / 1000);
  const retryAfter = Math.max(0, result.reset - nowSecs);

  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please slow down.",
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        "Retry-After": String(retryAfter),
        "X-Request-Id": requestId,
      },
    }
  );
}
