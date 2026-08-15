/**
 * Distributed rate limiting for CommonGrid API routes.
 *
 * Primary backend: Upstash Redis (sliding window). When
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are absent, falls back to
 * an in-process sliding-window store so budgets still return 429 instead of
 * silently unlimited traffic. The memory fallback is per-instance only and
 * is not a substitute for Redis on multi-instance serverless — configure
 * Upstash in every deployed environment.
 *
 * PRD-aligned tiers:
 *   anonymous     60 req/hr   (burst: 10 req/min)
 *   registered  5000 req/hr   (burst: 100 req/min)
 *   bulk       50000 req/hr   (burst: 500 req/min)
 *   write        100 req/min  — any mutating request
 *
 * Counter identity (set by middleware after auth):
 *   - Valid API key → `auth:<apiKeyId>` on the key's tier (registered/bulk)
 *   - No key → `ip:<clientIp>` on anonymous
 * Fabricated / invalid keys never reach this layer (401 from auth).
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

type WindowConfig = { limit: number; windowMs: number; prefix: string };

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Documented hourly (or per-minute for write) budgets. */
export const TIER_LIMITS = {
  anonymous: { limit: 60, windowMs: HOUR_MS },
  registered: { limit: 5000, windowMs: HOUR_MS },
  bulk: { limit: 50000, windowMs: HOUR_MS },
  write: { limit: 100, windowMs: MINUTE_MS },
} as const;

/** Burst limiters — short-window throttle to prevent stampedes. */
export const BURST_LIMITS = {
  anonymous: { limit: 10, windowMs: MINUTE_MS },
  registered: { limit: 100, windowMs: MINUTE_MS },
  bulk: { limit: 500, windowMs: MINUTE_MS },
} as const;

const TIER_CONFIG: Record<RateLimitTier, WindowConfig> = {
  anonymous: { ...TIER_LIMITS.anonymous, prefix: "cg:rl:anon" },
  registered: { ...TIER_LIMITS.registered, prefix: "cg:rl:reg" },
  bulk: { ...TIER_LIMITS.bulk, prefix: "cg:rl:bulk" },
  write: { ...TIER_LIMITS.write, prefix: "cg:rl:write" },
};

const BURST_CONFIG: Record<Exclude<RateLimitTier, "write">, WindowConfig> = {
  anonymous: { ...BURST_LIMITS.anonymous, prefix: "cg:rl:anon:burst" },
  registered: { ...BURST_LIMITS.registered, prefix: "cg:rl:reg:burst" },
  bulk: { ...BURST_LIMITS.bulk, prefix: "cg:rl:bulk:burst" },
};

/** Upstash slidingWindow duration strings (must match windowMs above). */
const UPSTASH_WINDOW = {
  hourly: "1 h",
  minute: "1 m",
} as const;

// ---------------------------------------------------------------------------
// In-process sliding window (dev / missing Redis fallback)
// ---------------------------------------------------------------------------

type MemoryBucket = Map<string, number[]>;

function memoryLimit(store: MemoryBucket, key: string, limit: number, windowMs: number): Omit<RateLimitResult, "tier"> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const prior = store.get(key) ?? [];
  const active = prior.filter((ts) => ts > windowStart);

  if (active.length >= limit) {
    const oldest = active[0] ?? now;
    return {
      success: false,
      remaining: 0,
      reset: Math.ceil((oldest + windowMs) / 1000),
      limit,
    };
  }

  active.push(now);
  store.set(key, active);

  const oldest = active[0] ?? now;
  return {
    success: true,
    remaining: limit - active.length,
    reset: Math.ceil((oldest + windowMs) / 1000),
    limit,
  };
}

interface MemoryLimiters {
  hourly: MemoryBucket;
  burst: MemoryBucket;
  write: MemoryBucket;
}

function createMemoryLimiters(): MemoryLimiters {
  return {
    hourly: new Map(),
    burst: new Map(),
    write: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Upstash limiter factory
// ---------------------------------------------------------------------------

interface UpstashLimiters {
  hourly: Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  burst: Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  write: Ratelimit;
}

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Build all rate-limiter instances backed by a single Redis connection.
 * Returns null when Upstash env vars are not set.
 */
export function createRateLimiter(): UpstashLimiters | null {
  if (!upstashConfigured()) return null;

  const redis = Redis.fromEnv();

  const hourly = {} as Record<Exclude<RateLimitTier, "write">, Ratelimit>;
  const burst = {} as Record<Exclude<RateLimitTier, "write">, Ratelimit>;

  for (const tier of ["anonymous", "registered", "bulk"] as const) {
    const hc = TIER_CONFIG[tier];
    hourly[tier] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(hc.limit, UPSTASH_WINDOW.hourly),
      prefix: hc.prefix,
    });

    const bc = BURST_CONFIG[tier];
    burst[tier] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(bc.limit, UPSTASH_WINDOW.minute),
      prefix: bc.prefix,
    });
  }

  const wc = TIER_CONFIG.write;
  const writeLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(wc.limit, UPSTASH_WINDOW.minute),
    prefix: wc.prefix,
  });

  return { hourly, burst, write: writeLimiter };
}

// Lazily initialised singletons — avoids creating Redis connections at import
// time (important for Next.js build/static generation).
let _upstash: UpstashLimiters | null | undefined;
let _memory: MemoryLimiters | null = null;
let _warnedMissingRedis = false;

function getUpstash(): UpstashLimiters | null {
  if (_upstash === undefined) {
    _upstash = createRateLimiter();
    if (!_upstash && process.env.NODE_ENV === "production" && !_warnedMissingRedis) {
      _warnedMissingRedis = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN unset — using in-process sliding windows. " +
          "Limits are per-instance only; configure Upstash for distributed enforcement."
      );
    }
  }
  return _upstash;
}

function getMemory(): MemoryLimiters {
  if (!_memory) {
    _memory = createMemoryLimiters();
  }
  return _memory;
}

/** Reset limiter singletons — for unit tests only. */
export function resetRateLimitersForTests(): void {
  _upstash = undefined;
  _memory = null;
  _warnedMissingRedis = false;
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
 *
 * Only call with `isAuthenticated: true` after a validated API key. Fabricated
 * keys must be rejected by auth before this runs.
 */
export function resolveTier(ctx: RateLimitContext): RateLimitTier {
  if (ctx.isWrite) return "write";
  if (ctx.isBulk && ctx.keyTier === "bulk") return "bulk";
  if (ctx.isAuthenticated) {
    return ctx.keyTier === "bulk" ? "bulk" : "registered";
  }
  return "anonymous";
}

/**
 * Build the rate-limit counter identity.
 *
 * Authenticated callers bucket by API key id (never by the raw secret).
 * Anonymous callers bucket by client IP. Present-but-invalid credentials
 * must not reach this helper — they 401 in auth middleware.
 */
export function rateLimitIdentifier(opts: { isAuthenticated: boolean; apiKeyId: string | null; ip: string }): string {
  if (opts.isAuthenticated && opts.apiKeyId) {
    return `auth:${opts.apiKeyId}`;
  }
  return `ip:${opts.ip || "unknown"}`;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

function fromUpstash(
  result: { success: boolean; remaining: number; reset: number; limit: number },
  tier: RateLimitTier
): RateLimitResult {
  return {
    success: result.success,
    remaining: result.remaining,
    reset: Math.ceil(result.reset / 1000),
    limit: result.limit,
    tier,
  };
}

async function checkWithUpstash(
  limiters: UpstashLimiters,
  identifier: string,
  tier: RateLimitTier
): Promise<RateLimitResult> {
  if (tier === "write") {
    const result = await limiters.write.limit(identifier);
    return fromUpstash(result, tier);
  }

  const readTier = tier;
  const burstResult = await limiters.burst[readTier].limit(identifier);
  if (!burstResult.success) {
    return fromUpstash(burstResult, tier);
  }

  const hourlyResult = await limiters.hourly[readTier].limit(identifier);
  return fromUpstash(hourlyResult, tier);
}

function checkWithMemory(limiters: MemoryLimiters, identifier: string, tier: RateLimitTier): RateLimitResult {
  if (tier === "write") {
    const cfg = TIER_CONFIG.write;
    const result = memoryLimit(limiters.write, `${cfg.prefix}:${identifier}`, cfg.limit, cfg.windowMs);
    return { ...result, tier };
  }

  const burstCfg = BURST_CONFIG[tier];
  const burstResult = memoryLimit(
    limiters.burst,
    `${burstCfg.prefix}:${identifier}`,
    burstCfg.limit,
    burstCfg.windowMs
  );
  if (!burstResult.success) {
    return { ...burstResult, tier };
  }

  const hourlyCfg = TIER_CONFIG[tier];
  const hourlyResult = memoryLimit(
    limiters.hourly,
    `${hourlyCfg.prefix}:${identifier}`,
    hourlyCfg.limit,
    hourlyCfg.windowMs
  );
  return { ...hourlyResult, tier };
}

/**
 * Apply the appropriate rate-limit tier for a request.
 *
 * `identifier` should be produced by {@link rateLimitIdentifier}
 * (`auth:<keyId>` or `ip:<ip>`). Always enforces documented budgets —
 * Upstash when configured, otherwise in-process sliding windows.
 */
export async function checkRateLimit(
  identifier: string,
  isAuthenticated: boolean,
  isWrite: boolean,
  isBulk: boolean,
  keyTier?: string
): Promise<RateLimitResult> {
  const tier = resolveTier({ isAuthenticated, isWrite, isBulk, keyTier });
  const upstash = getUpstash();

  if (upstash) {
    return checkWithUpstash(upstash, identifier, tier);
  }

  return checkWithMemory(getMemory(), identifier, tier);
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
    const tierLimit = TIER_LIMITS.anonymous.limit;
    const used = tierLimit - result.remaining;
    // Only nudge against the hourly budget (not a burst rejection whose
    // `limit` is the per-minute cap).
    if (result.limit === tierLimit && used >= tierLimit * 0.8) {
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
