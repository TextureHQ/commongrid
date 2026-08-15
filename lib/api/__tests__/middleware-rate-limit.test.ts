/**
 * Rate-limit wiring inside withApiMiddleware.
 *
 * Covers 429 + Retry-After, correct auth:/ip: counter keying, and that
 * fabricated keys never reach the limiter (401 from auth — Epic 2).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKey = vi.fn();
const checkRateLimit = vi.fn();
const rateLimitHeaders = vi.fn(() => ({}));
const rateLimitResponse = vi.fn((result: { reset: number }, requestId: string) => {
  const retryAfter = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
  return Response.json(
    { error: { code: "RATE_LIMITED", request_id: requestId, retryAfter } },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-Request-Id": requestId,
      },
    }
  );
});
const rateLimitIdentifier = vi.fn((opts: { isAuthenticated: boolean; apiKeyId: string | null; ip: string }) =>
  opts.isAuthenticated && opts.apiKeyId ? `auth:${opts.apiKeyId}` : `ip:${opts.ip || "unknown"}`
);
const trackUsage = vi.fn();

vi.mock("../auth", () => ({
  validateApiKey: (...args: unknown[]) => validateApiKey(...args),
}));

vi.mock("../rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  rateLimitHeaders: (result?: unknown) => rateLimitHeaders(result),
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

describe("withApiMiddleware rate limiting", () => {
  beforeEach(() => {
    validateApiKey.mockReset();
    checkRateLimit.mockReset();
    rateLimitHeaders.mockReset().mockReturnValue({
      "X-RateLimit-Limit": "60",
      "X-RateLimit-Remaining": "59",
      "X-RateLimit-Reset": "0",
      "X-RateLimit-Tier": "anonymous",
    });
    rateLimitResponse.mockClear();
    rateLimitIdentifier.mockClear();
    trackUsage.mockReset();

    checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      reset: 0,
      limit: 60,
      tier: "anonymous",
    });
  });

  it("anonymous → IP identifier, anonymous tier", async () => {
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
  });

  it("valid key → auth:<keyId> identifier, registered tier", async () => {
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
      reset: 0,
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
  });

  it("valid bulk key → auth:<keyId> identifier, bulk tier", async () => {
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
      reset: 0,
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
  });

  it("bulk key over budget → 429 with Retry-After", async () => {
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
  });

  it("over budget → 429 with Retry-After (does not call handler)", async () => {
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
  });
});
