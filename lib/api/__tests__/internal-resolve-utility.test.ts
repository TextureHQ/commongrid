/**
 * Tests for POST /api/internal/resolve-utility
 *
 * Route under test: `app/api/internal/resolve-utility/route.ts`.
 *
 * We mock the auth validator and the Drizzle DB client so the tests stay
 * hermetic (no DATABASE_URL required). Schema of the mocked DB `.execute`
 * return value matches the Neon-HTTP / drizzle `{ rows: [{ result: jsonb }] }`
 * shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be registered before importing the route.
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  validateApiKey: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { POST } from "@/app/api/internal/resolve-utility/route";
import { validateApiKey } from "@/lib/api/auth";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://commongrid.info/api/internal/resolve-utility", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer cg_test_key",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/internal/resolve-utility", () => {
  beforeEach(() => {
    vi.mocked(validateApiKey).mockReset();
    vi.mocked(getDb).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- 401 branch --------------------------------------------------------
  describe("auth", () => {
    it("returns 401 when validateApiKey rejects the request", async () => {
      vi.mocked(validateApiKey).mockResolvedValue({
        valid: false,
        error: "Invalid API key",
      });

      const res = await POST(makeRequest({ name: "Vermont Electric Cooperative" }), {});

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      // Never echo the key back.
      expect(JSON.stringify(body)).not.toContain("cg_test_key");
      // Internal routes must not be edge-cached.
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("returns 401 when Authorization header is missing", async () => {
      vi.mocked(validateApiKey).mockResolvedValue({
        valid: false,
        error: "Missing Authorization header",
      });

      const req = new Request("https://commongrid.info/api/internal/resolve-utility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Vermont Electric Cooperative" }),
      });
      const res = await POST(req, {});

      expect(res.status).toBe(401);
    });
  });

  // --- Validation / 400 branch -------------------------------------------
  describe("request validation", () => {
    beforeEach(() => {
      vi.mocked(validateApiKey).mockResolvedValue({
        valid: true,
        identity: "test-key",
      });
    });

    it("returns 400 when body is not valid JSON", async () => {
      const req = makeRequest("{not-json");
      const res = await POST(req, {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 when name is missing", async () => {
      const res = await POST(makeRequest({}), {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toMatch(/name/);
    });

    it("returns 400 when name is empty string", async () => {
      const res = await POST(makeRequest({ name: "   " }), {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when name exceeds 200 chars", async () => {
      const res = await POST(makeRequest({ name: "x".repeat(201) }), {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toMatch(/200/);
    });

    it("returns 400 when state is not 2 chars", async () => {
      const res = await POST(makeRequest({ name: "Vermont Electric", state: "VTT" }), {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // --- Happy path / 200 branch -------------------------------------------
  describe("happy path", () => {
    beforeEach(() => {
      vi.mocked(validateApiKey).mockResolvedValue({
        valid: true,
        identity: "test-key",
      });
    });

    it("returns the resolver JSONB payload verbatim (modulo normalization)", async () => {
      const fakeResult = {
        eia_id: "19791",
        confidence: 1.0,
        match_source: "exact",
        candidates: [
          {
            eia_id: "19791",
            name: "Vermont Electric Cooperative",
            jurisdiction: "VT",
            segment: "distribution",
            score: 1.0,
          },
        ],
        resolver_version: "1.0.0",
      };

      const execute = vi.fn().mockResolvedValue({ rows: [{ result: fakeResult }] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Vermont Electric Cooperative", state: "vt" }), {});

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.json();
      expect(body).toMatchObject({
        eia_id: "19791",
        confidence: 1.0,
        match_source: "exact",
        resolver_version: "1.0.0",
      });
      expect(body.candidates).toHaveLength(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("uppercases the state parameter before passing it to the resolver", async () => {
      const execute = vi.fn().mockResolvedValue({ rows: [{ result: { ...defaultResolverResult() } }] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      await POST(makeRequest({ name: "Vermont Electric", state: "vt" }), {});

      expect(execute).toHaveBeenCalledTimes(1);
      // Drizzle's `sql` tag produces an internal SQL builder whose params
      // live in a non-public field. Serialize it to JSON and assert the
      // uppercase code is in there and the lowercase input is not.
      const callArg = execute.mock.calls[0]?.[0];
      const serialized = JSON.stringify(callArg);
      expect(serialized).toContain("VT");
      // Only the lowercased state input should be absent; the lowercase
      // substring appears inside "Vermont" so check as an explicit param
      // value rather than substring.
      expect(serialized).not.toMatch(/"vt"/);
    });

    it("returns the DEFAULT_RESULT shape when the DB yields no rows", async () => {
      const execute = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Nonexistent Utility" }), {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        eia_id: null,
        confidence: 0,
        match_source: "none",
        candidates: [],
        resolver_version: "1.0.0",
      });
    });

    it("coerces string confidence from JSONB into a number", async () => {
      // Some drivers return pg JSONB numerics as strings — cover that.
      const execute = vi.fn().mockResolvedValue({
        rows: [
          {
            result: {
              eia_id: "19791",
              confidence: "0.92",
              match_source: "fuzzy_name_state",
              candidates: [],
              resolver_version: "1.0.0",
            },
          },
        ],
      });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Vermont Electric" }), {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.confidence).toBe("number");
      expect(body.confidence).toBeCloseTo(0.92, 5);
    });
  });

  // --- Method gate -------------------------------------------------------
  describe("method gate", () => {
    it("GET is rejected with 405", async () => {
      const mod = await import("@/app/api/internal/resolve-utility/route");
      const res = await mod.GET();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    });
  });
});

function defaultResolverResult() {
  return {
    eia_id: null,
    confidence: 0,
    match_source: "none",
    candidates: [],
    resolver_version: "1.0.0",
  };
}
