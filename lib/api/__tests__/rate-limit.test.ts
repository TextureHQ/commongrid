import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitResult } from "../rate-limit";
import {
  BURST_LIMITS,
  checkRateLimit,
  rateLimitHeaders,
  rateLimitIdentifier,
  rateLimitResponse,
  resetRateLimitersForTests,
  resolveTier,
  TIER_LIMITS,
} from "../rate-limit";

describe("resolveTier", () => {
  it("returns 'anonymous' for unauthenticated read requests", () => {
    expect(resolveTier({ isAuthenticated: false, isWrite: false, isBulk: false })).toBe("anonymous");
  });

  it("returns 'registered' for authenticated read requests", () => {
    expect(resolveTier({ isAuthenticated: true, isWrite: false, isBulk: false })).toBe("registered");
  });

  it("returns 'bulk' for authenticated bulk requests with bulk tier key", () => {
    expect(resolveTier({ isAuthenticated: true, isWrite: false, isBulk: true, keyTier: "bulk" })).toBe("bulk");
  });

  it("returns 'registered' for authenticated bulk requests without bulk tier key", () => {
    expect(resolveTier({ isAuthenticated: true, isWrite: false, isBulk: true, keyTier: "registered" })).toBe(
      "registered"
    );
  });

  it("returns 'write' for any write request", () => {
    expect(resolveTier({ isAuthenticated: true, isWrite: true, isBulk: false })).toBe("write");
    expect(resolveTier({ isAuthenticated: false, isWrite: true, isBulk: false })).toBe("write");
  });

  it("returns 'bulk' for authenticated read with bulk key tier (no isBulk flag)", () => {
    expect(resolveTier({ isAuthenticated: true, isWrite: false, isBulk: false, keyTier: "bulk" })).toBe("bulk");
  });
});

describe("rateLimitIdentifier", () => {
  it("buckets validated keys by api key id", () => {
    expect(rateLimitIdentifier({ isAuthenticated: true, apiKeyId: "key_abc", ip: "1.2.3.4" })).toBe("auth:key_abc");
  });

  it("buckets anonymous callers by IP (never elevates without a key id)", () => {
    expect(rateLimitIdentifier({ isAuthenticated: false, apiKeyId: null, ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    expect(rateLimitIdentifier({ isAuthenticated: true, apiKeyId: null, ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
  });
});

describe("rateLimitHeaders", () => {
  it("includes X-RateLimit-Tier header", () => {
    const result: RateLimitResult = {
      success: true,
      remaining: 50,
      reset: 1713400000,
      limit: 60,
      tier: "anonymous",
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-RateLimit-Tier"]).toBe("anonymous");
    expect(headers["X-RateLimit-Limit"]).toBe("60");
    expect(headers["X-RateLimit-Remaining"]).toBe("50");
  });

  it("adds registration nudge when anonymous user is at 80%+ of hourly budget", () => {
    const result: RateLimitResult = {
      success: true,
      remaining: 10, // 50 used out of 60 = 83%
      reset: 1713400000,
      limit: 60,
      tier: "anonymous",
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-CommonGrid-Register"]).toBeDefined();
    expect(headers["X-CommonGrid-Register"]).toContain("5,000 req/hr");
  });

  it("does NOT add nudge when anonymous user is below 80%", () => {
    const result: RateLimitResult = {
      success: true,
      remaining: 40, // 20 used out of 60 = 33%
      reset: 1713400000,
      limit: 60,
      tier: "anonymous",
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-CommonGrid-Register"]).toBeUndefined();
  });

  it("does NOT add nudge for registered tier", () => {
    const result: RateLimitResult = {
      success: true,
      remaining: 100,
      reset: 1713400000,
      limit: 5000,
      tier: "registered",
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-CommonGrid-Register"]).toBeUndefined();
  });

  it("does NOT add nudge on anonymous burst rejections", () => {
    const result: RateLimitResult = {
      success: false,
      remaining: 0,
      reset: 1713400000,
      limit: BURST_LIMITS.anonymous.limit,
      tier: "anonymous",
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-CommonGrid-Register"]).toBeUndefined();
  });
});

describe("rateLimitResponse", () => {
  it("returns a 429 response with PRD-aligned body and Retry-After", async () => {
    const result: RateLimitResult = {
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 60,
      tier: "anonymous",
    };
    const response = rateLimitResponse(result, "req_test123");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);

    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.currentTier).toBe("anonymous");
    expect(body.error.currentLimit).toBe(60);
    expect(body.error.docs).toBe("https://commongrid.info/docs/api/rate-limits");
    expect(body.error.retryAfter).toBeGreaterThan(0);
    expect(body.error.upgrade).toBeDefined();
  });

  it("does not include upgrade message for registered tier", async () => {
    const result: RateLimitResult = {
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 5000,
      tier: "registered",
    };
    const response = rateLimitResponse(result, "req_test456");
    const body = await response.json();
    expect(body.error.upgrade).toBeUndefined();
    expect(body.error.currentTier).toBe("registered");
  });
});

describe("checkRateLimit enforcement (in-process fallback)", () => {
  beforeEach(() => {
    // Force memory path — clear any Upstash env that might be present.
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetRateLimitersForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    resetRateLimitersForTests();
  });

  it("never returns placeholder 999 limits", async () => {
    const result = await checkRateLimit("ip:10.0.0.1", false, false, false);
    expect(result.limit).toBe(TIER_LIMITS.anonymous.limit);
    expect(result.remaining).toBeLessThan(TIER_LIMITS.anonymous.limit);
    expect(result.limit).not.toBe(999);
    expect(result.remaining).not.toBe(999);
    expect(result.tier).toBe("anonymous");
  });

  it("returns registered hourly budget for authenticated callers", async () => {
    const result = await checkRateLimit("auth:key_1", true, false, false, "registered");
    expect(result.success).toBe(true);
    expect(result.tier).toBe("registered");
    expect(result.limit).toBe(TIER_LIMITS.registered.limit);
  });

  it("trips anonymous burst (10/min) with Retry-After metadata", async () => {
    const id = "ip:burst-test";
    for (let i = 0; i < BURST_LIMITS.anonymous.limit; i++) {
      const ok = await checkRateLimit(id, false, false, false);
      expect(ok.success).toBe(true);
    }

    const blocked = await checkRateLimit(id, false, false, false);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(BURST_LIMITS.anonymous.limit);
    expect(blocked.tier).toBe("anonymous");
    expect(blocked.reset).toBeGreaterThan(Math.floor(Date.now() / 1000) - 1);

    const response = rateLimitResponse(blocked, "req_burst");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeDefined();
  });

  it("trips anonymous hourly budget (60/hr) when paced under burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const id = "ip:hourly-test";
    for (let i = 0; i < TIER_LIMITS.anonymous.limit; i++) {
      const ok = await checkRateLimit(id, false, false, false);
      expect(ok.success).toBe(true);
      expect(ok.limit).toBe(TIER_LIMITS.anonymous.limit);
      // Stay under burst (10/min): one request every 6s → 10/min max.
      vi.advanceTimersByTime(6_000);
    }

    const blocked = await checkRateLimit(id, false, false, false);
    expect(blocked.success).toBe(false);
    expect(blocked.limit).toBe(TIER_LIMITS.anonymous.limit);
    expect(blocked.tier).toBe("anonymous");

    const response = rateLimitResponse(blocked, "req_hourly");
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("isolates counters: auth key bucket ≠ IP bucket", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Exhaust anonymous IP budget.
    for (let i = 0; i < TIER_LIMITS.anonymous.limit; i++) {
      await checkRateLimit("ip:shared", false, false, false);
      vi.advanceTimersByTime(6_000);
    }
    const anonBlocked = await checkRateLimit("ip:shared", false, false, false);
    expect(anonBlocked.success).toBe(false);

    // Same wall clock, different identity → registered still allowed.
    const registered = await checkRateLimit("auth:key_ok", true, false, false, "registered");
    expect(registered.success).toBe(true);
    expect(registered.tier).toBe("registered");
    expect(registered.limit).toBe(TIER_LIMITS.registered.limit);
  });

  it("isolates counters across distinct API keys", async () => {
    const a = await checkRateLimit("auth:key_a", true, false, false, "registered");
    const b = await checkRateLimit("auth:key_b", true, false, false, "registered");
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    // Each key has its own remaining count (independent buckets).
    expect(a.remaining).toBe(TIER_LIMITS.registered.limit - 1);
    expect(b.remaining).toBe(TIER_LIMITS.registered.limit - 1);
  });

  it("trips registered hourly budget (5000/hr) when paced under burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const id = "auth:key_hourly_reg";
    for (let i = 0; i < TIER_LIMITS.registered.limit; i++) {
      const ok = await checkRateLimit(id, true, false, false, "registered");
      expect(ok.success).toBe(true);
      // Stay under burst (100/min): one request every 600ms.
      vi.advanceTimersByTime(600);
    }

    const blocked = await checkRateLimit(id, true, false, false, "registered");
    expect(blocked.success).toBe(false);
    expect(blocked.limit).toBe(TIER_LIMITS.registered.limit);
    expect(blocked.tier).toBe("registered");

    const response = rateLimitResponse(blocked, "req_reg_hourly");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeDefined();
  });

  it("returns bulk hourly budget for bulk-tier keys", async () => {
    const result = await checkRateLimit("auth:key_bulk", true, false, false, "bulk");
    expect(result.success).toBe(true);
    expect(result.tier).toBe("bulk");
    expect(result.limit).toBe(TIER_LIMITS.bulk.limit);
    expect(result.remaining).toBe(TIER_LIMITS.bulk.limit - 1);
  });

  it("trips bulk burst (500/min) with Retry-After — binding limit for bulk keys", async () => {
    // Burst 500/min caps sustained throughput at ~30k/hr, below the 50k hourly
    // budget, so bulk enforcement is exercised via burst (hourly cannot trip
    // while burst is respected).
    const id = "auth:key_bulk_burst";
    for (let i = 0; i < BURST_LIMITS.bulk.limit; i++) {
      const ok = await checkRateLimit(id, true, false, false, "bulk");
      expect(ok.success).toBe(true);
    }

    const blocked = await checkRateLimit(id, true, false, false, "bulk");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(BURST_LIMITS.bulk.limit);
    expect(blocked.tier).toBe("bulk");

    const response = rateLimitResponse(blocked, "req_bulk_burst");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeDefined();
  });

  it("keeps bulk and registered key buckets independent", async () => {
    const bulk = await checkRateLimit("auth:key_bulk_iso", true, false, false, "bulk");
    const registered = await checkRateLimit("auth:key_reg_iso", true, false, false, "registered");
    expect(bulk.success).toBe(true);
    expect(registered.success).toBe(true);
    expect(bulk.limit).toBe(TIER_LIMITS.bulk.limit);
    expect(registered.limit).toBe(TIER_LIMITS.registered.limit);
    expect(bulk.remaining).toBe(TIER_LIMITS.bulk.limit - 1);
    expect(registered.remaining).toBe(TIER_LIMITS.registered.limit - 1);
  });
});
