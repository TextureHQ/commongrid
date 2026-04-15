import { describe, expect, it } from "vitest";

import { hashApiKey, hasScope } from "../auth";

describe("hashApiKey", () => {
  it("returns a 64-char hex string", () => {
    const hash = hashApiKey("cg_test_key_12345");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const key = "cg_some_api_key";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("produces different hashes for different keys", () => {
    expect(hashApiKey("cg_key_a")).not.toBe(hashApiKey("cg_key_b"));
  });
});

describe("hasScope", () => {
  describe("exact match", () => {
    it("grants exact resource:action", () => {
      expect(hasScope(["utilities:read"], "utilities", "read")).toBe(true);
    });

    it("denies wrong action", () => {
      expect(hasScope(["utilities:read"], "utilities", "write")).toBe(false);
    });

    it("denies wrong resource", () => {
      expect(hasScope(["utilities:read"], "programs", "read")).toBe(false);
    });
  });

  describe("wildcard *:*", () => {
    it("grants any resource and action", () => {
      expect(hasScope(["*:*"], "utilities", "read")).toBe(true);
      expect(hasScope(["*:*"], "programs", "delete")).toBe(true);
    });
  });

  describe("wildcard *:action", () => {
    it("grants any resource for the specified action", () => {
      expect(hasScope(["*:read"], "utilities", "read")).toBe(true);
      expect(hasScope(["*:read"], "programs", "read")).toBe(true);
    });

    it("denies different action", () => {
      expect(hasScope(["*:read"], "utilities", "write")).toBe(false);
    });
  });

  describe("wildcard resource:*", () => {
    it("grants any action for the specified resource", () => {
      expect(hasScope(["utilities:*"], "utilities", "read")).toBe(true);
      expect(hasScope(["utilities:*"], "utilities", "write")).toBe(true);
    });

    it("denies different resource", () => {
      expect(hasScope(["utilities:*"], "programs", "read")).toBe(false);
    });
  });

  describe("multiple scopes", () => {
    it("grants if any scope matches", () => {
      expect(hasScope(["programs:read", "utilities:read"], "utilities", "read")).toBe(true);
    });

    it("denies if no scope matches", () => {
      expect(hasScope(["programs:read", "utilities:write"], "utilities", "read")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty scopes array", () => {
      expect(hasScope([], "utilities", "read")).toBe(false);
    });

    it("skips malformed scope entries (no colon)", () => {
      expect(hasScope(["nocolon", "utilities:read"], "utilities", "read")).toBe(true);
      expect(hasScope(["nocolon"], "utilities", "read")).toBe(false);
    });
  });
});
