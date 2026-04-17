import { describe, expect, it } from "vitest";
import type { RateLimitResult } from "../rate-limit";
import { rateLimitHeaders, rateLimitResponse, resolveTier } from "../rate-limit";

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

  it("adds registration nudge when anonymous user is at 80%+ usage", () => {
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
});

describe("rateLimitResponse", () => {
  it("returns a 429 response with PRD-aligned body", async () => {
    const result: RateLimitResult = {
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 60,
      tier: "anonymous",
    };
    const response = rateLimitResponse(result, "req_test123");
    expect(response.status).toBe(429);

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
