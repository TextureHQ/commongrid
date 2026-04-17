/**
 * Distributed rate limiting for CommonGrid API routes.
 *
 * Uses Upstash Redis with a sliding-window algorithm. When
 * UPSTASH_REDIS_REST_URL is absent (e.g., local dev) all limits pass
 * through so the app still works without Redis configured.
 *
 * PRD-aligned tiers:
 *   anonymous     60 req/hr   (burst: 10 req/min)
 *   registered  5000 req/hr   (burst: 100 req/min)
 *   bulk       50000 req/hr   (burst: 500 req/min)
 *   write        100 req/min  — any mutating request
 *
 * See docs/specs/persistence-api.md §5.4 and LDR-66.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitTier = "anonymous" | "registered" | "bulk" | "write";

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Unix timestamp (seconds) at which the window resets. */
  reset: number;
  limit: number;
  /** The tier that was applied for this request. */
  tier: RateLimitTier;
};

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<RateLimitTier, { limit: number; window: string; prefix: string }> = {
  anonymous: { limit: 60, window: "1 h", prefix: "cg:rl:anon" },
  registered: { limit: 5000, window: "1 h", prefix: "cg:rl:reg" },
  bulk: { limit: 50000, window: "1 h", prefix: "cg:rl:bulk" },
  write: { limit: 100, window: "1 m", prefix: "cg:rl:write" },
};

/** Burst limiters — short-window throttle to prevent stampedes. */
const BURST_CONFIG: Record<Exclude<RateLimitTier, "write">, { limit: number; window: string; prefix: string }> = {
  anonymous: { limit: 10, window: "1 m", prefix: "cg:rl:anon:burst" },
  registered: { limit: 100, window: "1 m", prefix: "cg:rl:reg:burst" },
  bulk: { limit: 500, window: "1 m", prefix: "cg:rl:bulk:burst" },
};

// ---------------------------------------------------------------------------
// Limiter factory
// ---------------------------------------------------------------------------

interface RateLimiters {
  hourly: Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  burst: Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  write: Ratelimit;
}

/**
 * Build all rate-limiter instances backed by a single Redis connection.
 * Returns null when UPSTASH_REDIS_REST_URL is not set.
 */
export function createRateLimiter(): RateLimiters | null {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  const redis = Redis.fromEnv();

  const hourly = {} as Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  const burst = {} as Record<Exclude<RateLimitTier, "write">, Ratelimit>;

  for (const tier of ["anonymous", "registered", "bulk"] as const) {
    const hc = TIER_CONFIG[tier];
    hourly[tier] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(hc.limit, hc.window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      prefix: hc.prefix,
    });

    const bc = BURST_CONFIG[tier];
    burst[tier] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(bc.limit, bc.window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      prefix: bc.prefix,
    });
  }

  const wc = TIER_CONFIG.write;
  const writeLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(wc.limit, wc.window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    prefix: wc.prefix,
  });

  return { hourly, burst, write: writeLimiter };
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
// Tier resolution
// ---------------------------------------------------------------------------

export interface RateLimitContext {
  isAuthenticated: boolean;
  isWrite: boolean;
  isBulk: boolean;
  /** The key's tier from the api_keys table (if authenticated). */
  keyTier?: string;
}

/**
 * Determine the rate-limit tier for a request.
 */
export function resolveTier(ctx: RateLimitContext): RateLimitTier {
  if (ctx.isWrite) return "write";
  if (ctx.isBulk && ctx.keyTier === "bulk") return "bulk";
  if (ctx.isAuthenticated) {
    return ctx.keyTier === "bulk" ? "bulk" : "registered";
  }
  return "anonymous";
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
  isBulk: boolean,
  keyTier?: string
): Promise<RateLimitResult> {
  const tier = resolveTier({ isAuthenticated, isWrite, isBulk, keyTier });
  const limiters = getLimiters();

  if (!limiters) {
    // Dev fallback — no Redis configured.
    return { success: true, remaining: 999, reset: 0, limit: 999, tier };
  }

  // Write tier uses its own dedicated limiter
  if (tier === "write") {
    const result = await limiters.write.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: Math.ceil(result.reset / 1000),
      limit: result.limit,
      tier,
    };
  }

  // For read tiers: check both hourly and burst windows
  const readTier = tier as Exclude<RateLimitTier, "write">;

  // Check burst first (cheaper to fail fast on stampede)
  const burstResult = await limiters.burst[readTier].limit(identifier);
  if (!burstResult.success) {
    return {
      success: false,
      remaining: burstResult.remaining,
      reset: Math.ceil(burstResult.reset / 1000),
      limit: burstResult.limit,
      tier,
    };
  }

  // Check hourly window
  const hourlyResult = await limiters.hourly[readTier].limit(identifier);
  return {
    success: hourlyResult.success,
    remaining: hourlyResult.remaining,
    reset: Math.ceil(hourlyResult.reset / 1000),
    limit: hourlyResult.limit,
    tier,
  };
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** Standard rate-limit response headers. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
    "X-RateLimit-Tier": result.tier,
  };

  // Nudge anonymous users to register when they've used 80% of their limit
  if (result.tier === "anonymous") {
    const tierLimit = TIER_CONFIG.anonymous.limit; // 60/hr
    const used = tierLimit - result.remaining;
    if (used >= tierLimit * 0.8) {
      headers["X-CommonGrid-Register"] =
        "You're approaching the anonymous rate limit. Register for a free API key at https://commongrid.info/developers for 5,000 req/hr.";
    }
  }

  return headers;
}

/** Build a 429 response with Retry-After and rate-limit headers. */
export function rateLimitResponse(result: RateLimitResult, requestId: string): Response {
  const nowSecs = Math.floor(Date.now() / 1000);
  const retryAfter = Math.max(0, result.reset - nowSecs);

  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please slow down.",
        request_id: requestId,
        timestamp: new Date().toISOString(),
        currentTier: result.tier,
        currentLimit: result.limit,
        retryAfter,
        docs: "https://commongrid.info/docs/api/rate-limits",
        ...(result.tier === "anonymous"
          ? {
              upgrade:
                "Register for a free API key at https://commongrid.info/developers to increase your limit to 5,000 req/hr.",
            }
          : {}),
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
