/**
 * Auth matrix for withApiMiddleware.
 *
 * Pins Variant A: only `Authorization: Bearer <key>` elevates; other
 * Authorization schemes 401; X-API-Key is ignored (stays anonymous).
 * Known active keys elevate to registered/bulk; unknown tokens get 401
 * (no silent anonymous downgrade, no fabricated-key elevation).
 *
 * Auth runs before rate limiting on every public `/api/v1/*` route.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKey = vi.fn();
const checkRateLimit = vi.fn();
const rateLimitHeaders = vi.fn(() => ({}));
const trackUsage = vi.fn();

vi.mock("../auth", () => ({
  validateApiKey: (...args: unknown[]) => validateApiKey(...args),
}));

vi.mock("../rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  rateLimitHeaders: (result?: unknown) => rateLimitHeaders(result),
  rateLimitResponse: vi.fn(),
}));

vi.mock("../usage-tracker", () => ({
  normalizeEndpoint: (url: string) => new URL(url).pathname,
  trackUsage: (...args: unknown[]) => trackUsage(...args),
}));

vi.mock("../cors", () => ({
  withCors: (handler: (req: Request, ctx: { requestId: string }) => Promise<Response>) => handler,
}));

const { withApiMiddleware } = await import("../middleware");

function request(options?: { authorization?: string | null; apiKey?: string }): Request {
  const headers = new Headers();
  if (options?.authorization !== undefined && options.authorization !== null) {
    headers.set("Authorization", options.authorization);
  }
  if (options?.apiKey !== undefined) {
    headers.set("X-API-Key", options.apiKey);
  }
  return new Request("https://commongrid.info/api/v1/utilities", { headers });
}

describe("withApiMiddleware Bearer validation", () => {
  beforeEach(() => {
    validateApiKey.mockReset();
    checkRateLimit.mockReset();
    rateLimitHeaders.mockReset().mockReturnValue({});
    trackUsage.mockReset();

    checkRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      reset: 0,
      limit: 60,
      tier: "anonymous",
    });
  });

  it("no Authorization → anonymous (validateApiKey not called)", async () => {
    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request(), { requestId: "req_anon" });

    expect(response.status).toBe(200);
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^ip:/), false, false, false, undefined);
  });

  it("valid Bearer key → registered tier with key id identity", async () => {
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
    expect(validateApiKey).toHaveBeenCalledWith("Bearer cg_valid-key", "", "");
    expect(checkRateLimit).toHaveBeenCalledWith("auth:key_123", true, false, false, "registered");
  });

  it("valid bulk key → bulk tier", async () => {
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
    expect(checkRateLimit).toHaveBeenCalledWith("auth:key_bulk", true, false, false, "bulk");
  });

  it("fabricated / unknown Bearer → 401 (does not elevate, does not fall back to anonymous)", async () => {
    validateApiKey.mockResolvedValue({ valid: false, error: "Invalid API key" });

    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withApiMiddleware(inner, { trackUsage: false });

    const response = await handler(request({ authorization: "Bearer cg_unknown-key" }), {
      requestId: "req_bad",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid API key");
    expect(inner).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("empty Bearer → 401", async () => {
    validateApiKey.mockResolvedValue({
      valid: false,
      error: "Invalid Authorization header format",
    });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "Bearer " }), {
      requestId: "req_empty",
    });

    expect(response.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("Basic Authorization → 401 (malformed credentials)", async () => {
    validateApiKey.mockResolvedValue({
      valid: false,
      error: "Invalid Authorization header format",
    });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "Basic dXNlcjpwYXNz" }), {
      requestId: "req_basic",
    });

    expect(response.status).toBe(401);
    expect(validateApiKey).toHaveBeenCalledWith("Basic dXNlcjpwYXNz", "", "");
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("raw token without scheme → 401 (malformed credentials)", async () => {
    validateApiKey.mockResolvedValue({
      valid: false,
      error: "Invalid Authorization header format",
    });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "cg_raw_token" }), {
      requestId: "req_raw",
    });

    expect(response.status).toBe(401);
    expect(validateApiKey).toHaveBeenCalledWith("cg_raw_token", "", "");
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("X-API-Key alone → anonymous (ignored, not treated as a credential)", async () => {
    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ apiKey: "cg_via_x_api_key" }), {
      requestId: "req_xapi",
    });

    expect(response.status).toBe(200);
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^ip:/), false, false, false, undefined);
  });

  it("inactive key → 401", async () => {
    validateApiKey.mockResolvedValue({ valid: false, error: "API key is inactive" });

    const handler = withApiMiddleware(async () => Response.json({ ok: true }), {
      trackUsage: false,
    });

    const response = await handler(request({ authorization: "Bearer cg_revoked" }), {
      requestId: "req_inactive",
    });

    expect(response.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
