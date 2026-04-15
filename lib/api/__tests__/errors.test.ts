import { describe, expect, it } from "vitest";

import { ApiError, formatError } from "../errors";

describe("ApiError", () => {
  it("sets name, code, message, and status", () => {
    const err = new ApiError("NOT_FOUND", "Resource not found");
    expect(err.name).toBe("ApiError");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Resource not found");
    expect(err.status).toBe(404);
  });

  it("maps all known error codes to correct HTTP status", () => {
    const cases: Array<[string, number]> = [
      ["BAD_REQUEST", 400],
      ["VALIDATION_ERROR", 400],
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["RATE_LIMITED", 429],
      ["INTERNAL_ERROR", 500],
    ];
    for (const [code, status] of cases) {
      expect(new ApiError(code, "msg").status).toBe(status);
    }
  });

  it("defaults unknown codes to 500", () => {
    const err = new ApiError("UNKNOWN_CODE", "oops");
    expect(err.status).toBe(500);
  });

  it("stores optional details", () => {
    const details = { field: "name", issue: "required" };
    const err = new ApiError("VALIDATION_ERROR", "Bad input", details);
    expect(err.details).toEqual(details);
  });

  it("is an instance of Error", () => {
    expect(new ApiError("BAD_REQUEST", "bad")).toBeInstanceOf(Error);
  });
});

describe("formatError", () => {
  it("returns standard error envelope", () => {
    const err = new ApiError("UNAUTHORIZED", "No token");
    const result = formatError(err, "req-123");
    expect(result.error.code).toBe("UNAUTHORIZED");
    expect(result.error.message).toBe("No token");
    expect(result.error.request_id).toBe("req-123");
    expect(typeof result.error.timestamp).toBe("string");
  });

  it("omits details key when there are no details", () => {
    const err = new ApiError("NOT_FOUND", "Missing");
    const result = formatError(err, "req-abc");
    expect("details" in result.error).toBe(false);
  });

  it("includes details when present", () => {
    const err = new ApiError("BAD_REQUEST", "Bad", { hint: "check id" });
    const result = formatError(err, "req-xyz");
    expect(result.error.details).toEqual({ hint: "check id" });
  });

  it("timestamp is a valid ISO 8601 string", () => {
    const err = new ApiError("INTERNAL_ERROR", "Oops");
    const result = formatError(err, "r");
    expect(() => new Date(result.error.timestamp)).not.toThrow();
    expect(new Date(result.error.timestamp).toISOString()).toBe(result.error.timestamp);
  });
});
