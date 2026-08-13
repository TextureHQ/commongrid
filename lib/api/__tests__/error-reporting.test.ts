/**
 * Regression tests for server-side error reporting.
 *
 * Context: for four months CommonGrid's API returned 500s that were only ever
 * written to `console.error`, so production failures never became Sentry issues
 * and nothing could alert on them. These tests pin the contract that 5xx
 * responses are reported and 4xx responses are not.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const setTag = vi.fn();
const setContext = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException,
  withScope: (callback: (scope: { setTag: typeof setTag; setContext: typeof setContext }) => void) => {
    callback({ setTag, setContext });
  },
}));

const { ApiError } = await import("../errors");
const { withErrorHandling } = await import("../middleware");

function request(pathname = "/api/v1/utilities"): Request {
  return new Request(`https://commongrid.info${pathname}`);
}

describe("withErrorHandling Sentry reporting", () => {
  beforeEach(() => {
    captureException.mockClear();
    setTag.mockClear();
    setContext.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports unexpected errors to Sentry and returns a 500", async () => {
    const boom = new Error("database exploded");
    const handler = withErrorHandling(() => {
      throw boom;
    });

    const response = await handler(request(), { requestId: "req_test" });

    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom);
  });

  it("reports 5xx ApiErrors to Sentry", async () => {
    const handler = withErrorHandling(() => {
      throw new ApiError("INTERNAL_ERROR", "upstream failed");
    });

    const response = await handler(request(), { requestId: "req_test" });

    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("does NOT report client errors (4xx) — they are expected traffic", async () => {
    for (const code of ["NOT_FOUND", "VALIDATION_ERROR", "UNAUTHORIZED", "RATE_LIMITED"]) {
      captureException.mockClear();

      const handler = withErrorHandling(() => {
        throw new ApiError(code, `client error: ${code}`);
      });

      const response = await handler(request(), { requestId: "req_test" });

      expect(response.status).toBeLessThan(500);
      expect(captureException).not.toHaveBeenCalled();
    }
  });

  it("tags reports with the route, method and request id", async () => {
    const handler = withErrorHandling(() => {
      throw new Error("boom");
    });

    await handler(request("/api/v1/power-plants"), { requestId: "req_abc123" });

    const tags = Object.fromEntries(setTag.mock.calls);
    expect(tags["api.route"]).toBe("/api/v1/power-plants");
    expect(tags["http.method"]).toBe("GET");
    expect(tags.request_id).toBe("req_abc123");
    expect(tags["api.error_code"]).toBe("INTERNAL_ERROR");
  });

  it("still returns a structured error body when reporting", async () => {
    const handler = withErrorHandling(() => {
      throw new Error("boom");
    });

    const response = await handler(request(), { requestId: "req_test" });
    const body = (await response.json()) as { error: { code: string; request_id: string } };

    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.request_id).toBe("req_test");
    expect(response.headers.get("X-Request-Id")).toBe("req_test");
  });
});
