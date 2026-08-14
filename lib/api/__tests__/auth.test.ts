import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashApiKey, hasScope, parseBearerToken } from "../auth";

const selectLimit = vi.fn();
const updateCatch = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => selectLimit(...args),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          catch: (...args: unknown[]) => updateCatch(...args),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apiKeys: {
    keyHash: "key_hash",
  },
}));

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

describe("parseBearerToken", () => {
  it("extracts the token from a Bearer header", () => {
    expect(parseBearerToken("Bearer cg_abc")).toBe("cg_abc");
  });

  it("is case-insensitive on the scheme", () => {
    expect(parseBearerToken("bearer cg_abc")).toBe("cg_abc");
    expect(parseBearerToken("BEARER cg_abc")).toBe("cg_abc");
  });

  it("rejects Basic and other schemes", () => {
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearerToken("Digest abc")).toBeNull();
  });

  it("rejects a raw token without a scheme", () => {
    expect(parseBearerToken("cg_abc")).toBeNull();
  });

  it("rejects empty Bearer tokens", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Bearer   ")).toBeNull();
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

describe("validateApiKey", () => {
  beforeEach(() => {
    selectLimit.mockReset();
    updateCatch.mockReset();
  });

  it("rejects missing Authorization", async () => {
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey(null, "", "")).resolves.toEqual({
      valid: false,
      error: "Missing Authorization header",
    });
    expect(selectLimit).not.toHaveBeenCalled();
  });

  it("rejects non-Bearer schemes", async () => {
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Basic abc", "", "")).resolves.toEqual({
      valid: false,
      error: "Invalid Authorization header format",
    });
    await expect(validateApiKey("cg_raw_token_no_scheme", "", "")).resolves.toEqual({
      valid: false,
      error: "Invalid Authorization header format",
    });
  });

  it("accepts case-insensitive Bearer scheme", async () => {
    selectLimit.mockResolvedValue([
      {
        id: "key_1",
        name: "Test",
        isActive: true,
        expiresAt: null,
        scopes: ["*:read"],
        tier: "registered",
      },
    ]);
    updateCatch.mockReturnValue(undefined);
    const { validateApiKey } = await import("../auth");
    const result = await validateApiKey("bearer cg_active-key", "", "");
    expect(result.valid).toBe(true);
  });

  it("rejects empty Bearer token", async () => {
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer   ", "", "")).resolves.toEqual({
      valid: false,
      error: "Invalid Authorization header format",
    });
  });

  it("rejects keys that are not cg_-prefixed", async () => {
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer not_a_cg_key", "", "")).resolves.toEqual({
      valid: false,
      error: "Invalid API key format",
    });
  });

  it("rejects unknown keys", async () => {
    selectLimit.mockResolvedValue([]);
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer cg_unknown", "", "")).resolves.toEqual({
      valid: false,
      error: "Invalid API key",
    });
  });

  it("rejects inactive keys", async () => {
    selectLimit.mockResolvedValue([
      {
        id: "key_1",
        name: "Revoked",
        scopes: ["*:read"],
        isActive: false,
        expiresAt: null,
        tier: "registered",
      },
    ]);
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer cg_revoked", "", "")).resolves.toEqual({
      valid: false,
      error: "API key is inactive",
    });
  });

  it("accepts active keys and returns registered tier without scope check", async () => {
    selectLimit.mockResolvedValue([
      {
        id: "key_1",
        name: "My App",
        scopes: ["utilities:read"],
        isActive: true,
        expiresAt: null,
        tier: "registered",
      },
    ]);
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer cg_active-key", "", "")).resolves.toEqual({
      valid: true,
      identity: "My App",
      apiKeyId: "key_1",
      tier: "registered",
      scopes: ["utilities:read"],
    });
  });

  it("maps bulk tier from the key row", async () => {
    selectLimit.mockResolvedValue([
      {
        id: "key_bulk",
        name: "Bulk",
        scopes: ["*:read"],
        isActive: true,
        expiresAt: null,
        tier: "bulk",
      },
    ]);
    const { validateApiKey } = await import("../auth");
    const result = await validateApiKey("Bearer cg_bulk-key", "", "");
    expect(result.valid).toBe(true);
    expect(result.tier).toBe("bulk");
  });

  it("enforces scopes when resource and action are provided", async () => {
    selectLimit.mockResolvedValue([
      {
        id: "key_1",
        name: "Read only",
        scopes: ["*:read"],
        isActive: true,
        expiresAt: null,
        tier: "registered",
      },
    ]);
    const { validateApiKey } = await import("../auth");
    await expect(validateApiKey("Bearer cg_readonly", "utilities", "write")).resolves.toEqual({
      valid: false,
      error: "Insufficient scope",
    });
  });
});
