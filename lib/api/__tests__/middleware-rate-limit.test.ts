/**
 * Rate-limit wiring inside withApiMiddleware.
 *
 * Covers 429 + Retry-After, correct auth:/ip: counter keying, real
 * X-RateLimit-* budgets on success and 429 (no placeholder 999), and that
 * fabricated keys never reach the limiter (401 from auth — Epic 2).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKey = vi.fn();
const checkRateLimit = vi.fn();
const rateLimitHeaders = vi.fn((result: { limit: number; remaining: number; reset: number; tier: string }) => ({
  "X-RateLimit-Limit": String(result.limit),
  "X-RateLimit-Remaining": String(result.remaining),
  "X-RateLimit-Reset": String(result.reset),
  "X-RateLimit-Tier": result.tier,
}));
const rateLimitResponse = vi.fn(
  (result: { reset: number; limit: number; remaining: number; tier: string }, requestId: string) => {
    const retryAfter = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
    return Response.json(
      { error: { code: "RATE_LIMITED", request_id: requestId, retryAfter } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.reset),
          "X-RateLimit-Tier": result.tier,
          "Retry-After": String(retryAfter),
          "X-Request-Id": requestId,
        },
      }
    );
  }
);
const rateLimitIdentifier = vi.fn((opts: { isAuthenticated: boolean; apiKeyId: string | null; ip: string }) =>
  opts.isAuthenticated && opts.apiKeyId ? `auth:${opts.apiKeyId}` : `ip:${opts.ip || "unknown"}`
);
const trackUsage = vi.fn();

vi.mock("../auth", () => ({
  validateApiKey: (...args: unknown[]) => validateApiKey(...args),
}));

vi.mock("../rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  rateLimitHeaders: (...args: unknown[]) => rateLimitHeaders(...(args as [never])),
  rateLimitResponse: (...args: unknown[]) => rateLimitResponse(...(args as [never, string])),
  rateLimitIdentifier: (...args: unknown[]) => rateLimitIdentifier(...(args as [never])),
}));

vi.mock("../usage-tracker", () => ({
  normalizeEndpoint: (url: string) => new URL(url).pathname,
  trackUsage: (...args: unknown[]) => trackUsage(...args),
}));

vi.mock("../cors", () => ({
  withCors: (handler: (req: Request, ctx: { requestId: string }) => Promise<Response>) => handler,
}));

const { withApiMiddleware } = await import("../middleware");

function request(options?: { authorization?: string | null; apiKey?: string; forwardedFor?: string }): Request {
  const headers = new Headers();
  if (options?.authorization !== undefined && options.authorization !== null) {
    headers.set("Authorization", options.authorization);
  }
  if (options?.apiKey !== undefined) {
    headers.set("X-API-Key", options.apiKey);
  }
  if (options?.forwardedFor) {
    headers.set("x-forwarded-for", options.forwardedFor);
  }
  return new Request("https://commongrid.info/api/v1/utilities", { headers });
}

function expectRateLimitHeaders(
  response: Response,
  expected: { limit: string; remaining: string; tier: string }
): void {
  expect(response.headers.get("X-RateLimit-Limit")).toBe(expected.limit);
  expect(response.headers.get("X-RateLimit-Remaining")).toBe(expected.remaining);
  expect(response.headers.get("X-RateLimit-Tier")).toBe(expected.tier);
  expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
  // Placeholder budgets from the pre-Upstash fallback must never reappear.
  expect(response.headers.get("X-RateLimit-Limit")).not.toBe("999");
  expect(response.headers.get("X-RateLimit-Remaining")).not.toBe("999");
}

describe("withApiMiddleware rate limiting", () => {
  beforeEach(() => {
    validateApiKey.mockReset();
    checkRateLimit.mockReset();
    rateLimitHeaders.mockClear();
    rateLimitResponse.mockClear();
    rateLimitIdentifier.mockClear();
    trackUsage.mockReset();

    checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      reset: 1_714_000_000,
      limit: 60,
      tier: "anonymous",
    });
  });

  it("anonymous success → real X-RateLimit-* budgets on the response", async () => {
    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ forwardedFor: "203.0.113.10" }), {
      requestId: "req_anon",
    });

    expect(response.status).toBe(200);
    expect(rateLimitIdentifier).toHaveBeenCalledWith({
      isAuthenticated: false,
      apiKeyId: null,
      ip: "203.0.113.10",
    });
    expect(checkRateLimit).toHaveBeenCalledWith("ip:203.0.113.10", false, false, false, undefined);
    expect(rateLimitHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 60, remaining: 59, tier: "anonymous" })
    );
    expectRateLimitHeaders(response, { limit: "60", remaining: "59", tier: "anonymous" });
  });

  it("valid key success → registered budget headers (not 999)", async () => {
    validateApiKey.mockResolvedValue({
      valid: true,
      identity: "My App key",
      apiKeyId: "key_123",
      tier: "registered",
      scopes: ["*:read"],
    });
    checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 4999,
      reset: 1_714_000_000,
      limit: 5000,
      tier: "registered",
    });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "Bearer cg_valid-key" }), {
      requestId: "req_reg",
    });

    expect(response.status).toBe(200);
    expect(rateLimitIdentifier).toHaveBeenCalledWith({
      isAuthenticated: true,
      apiKeyId: "key_123",
      ip: "unknown",
    });
    expect(checkRateLimit).toHaveBeenCalledWith("auth:key_123", true, false, false, "registered");
    expectRateLimitHeaders(response, { limit: "5000", remaining: "4999", tier: "registered" });
  });

  it("valid bulk key → auth:<keyId> identifier, bulk tier headers", async () => {
    validateApiKey.mockResolvedValue({
      valid: true,
      identity: "Bulk key",
      apiKeyId: "key_bulk",
      tier: "bulk",
      scopes: ["*:read"],
    });
    checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 49999,
      reset: 1_714_000_000,
      limit: 50000,
      tier: "bulk",
    });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "Bearer cg_bulk-key" }), {
      requestId: "req_bulk",
    });

    expect(response.status).toBe(200);
    expect(rateLimitIdentifier).toHaveBeenCalledWith({
      isAuthenticated: true,
      apiKeyId: "key_bulk",
      ip: "unknown",
    });
    expect(checkRateLimit).toHaveBeenCalledWith("auth:key_bulk", true, false, false, "bulk");
    expectRateLimitHeaders(response, { limit: "50000", remaining: "49999", tier: "bulk" });
  });

  it("bulk key over budget → 429 with Retry-After and rate-limit headers", async () => {
    validateApiKey.mockResolvedValue({
      valid: true,
      identity: "Bulk key",
      apiKeyId: "key_bulk",
      tier: "bulk",
      scopes: ["*:read"],
    });
    const reset = Math.floor(Date.now() / 1000) + 90;
    checkRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset,
      limit: 50000,
      tier: "bulk",
    });

    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withApiMiddleware(inner, { trackUsage: false });

    const response = await handler(request({ authorization: "Bearer cg_bulk-key" }), {
      requestId: "req_bulk_429",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(inner).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("auth:key_bulk", true, false, false, "bulk");
    expectRateLimitHeaders(response, { limit: "50000", remaining: "0", tier: "bulk" });
  });

  it("over budget → 429 with Retry-After and real anonymous budget headers", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    checkRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset,
      limit: 60,
      tier: "anonymous",
    });

    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withApiMiddleware(inner, { trackUsage: false });

    const response = await handler(request({ forwardedFor: "198.51.100.1" }), {
      requestId: "req_429",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(inner).not.toHaveBeenCalled();
    expect(rateLimitResponse).toHaveBeenCalled();
    expectRateLimitHeaders(response, { limit: "60", remaining: "0", tier: "anonymous" });
  });

  it("fabricated Bearer → 401 before rate limit (no registered bypass)", async () => {
    validateApiKey.mockResolvedValue({ valid: false, error: "Invalid API key" });

    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withApiMiddleware(inner, { trackUsage: false });

    const response = await handler(request({ authorization: "Bearer cg_fake" }), {
      requestId: "req_fake",
    });

    expect(response.status).toBe(401);
    expect(inner).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(rateLimitIdentifier).not.toHaveBeenCalled();
    expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
  });
});
