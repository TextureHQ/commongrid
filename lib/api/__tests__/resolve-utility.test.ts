/**
 * Tests for POST /api/v1/utilities/resolve
 *
 * Route under test: `app/api/v1/utilities/resolve/route.ts`.
 *
 * The route is public (no auth required) — same contract as every other
 * /api/v1/* route — so we don't exercise auth here, we exercise:
 *   - request validation (400 branches)
 *   - happy path (200 branch)
 *   - output normalization (legacy match_source aliases, canonical_name fallback)
 *   - method gate (GET → 405)
 *
 * We mock the Drizzle DB client so the tests stay hermetic (no DATABASE_URL
 * required). The mocked `.execute` return value matches the Neon-HTTP /
 * drizzle `{ rows: [{ result: jsonb }] }` shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be registered before importing the route.
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
  db: null,
}));

import { POST } from "@/app/api/v1/utilities/resolve/route";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://commongrid.info/api/v1/utilities/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/utilities/resolve", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation / 400 branch -------------------------------------------
  describe("request validation", () => {
    it("returns 400 when body is not valid JSON", async () => {
      const res = await POST(makeRequest("{not-json"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 when name is missing", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toMatch(/name/);
    });

    it("returns 400 when name is empty string", async () => {
      const res = await POST(makeRequest({ name: "   " }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when name exceeds 200 chars", async () => {
      const res = await POST(makeRequest({ name: "x".repeat(201) }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toMatch(/200/);
    });

    it("returns 400 when state is not a 2-letter code", async () => {
      const res = await POST(makeRequest({ name: "Vermont Electric", state: "VTT" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when domain contains whitespace or '@'", async () => {
      const res = await POST(makeRequest({ name: "x", domain: "foo@bar.com" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when confidence_threshold is out of range", async () => {
      const res = await POST(makeRequest({ name: "x", confidence_threshold: 2 }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // --- Happy path / 200 branch -------------------------------------------
  describe("happy path", () => {
    it("returns the public contract shape (canonical_name, candidates.score)", async () => {
      const fakeResult = {
        eia_id: "19791",
        confidence: 1.0,
        match_source: "override",
        candidates: [
          {
            eia_id: "19791",
            name: "Vermont Electric Cooperative",
            segment: "distribution",
            state: "VT",
            match_score: 1.0,
          },
        ],
        resolver_version: "1.0.0",
      };

      const execute = vi.fn().mockResolvedValue({ rows: [{ result: fakeResult }] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Vermont Electric Cooperative", state: "vt" }));

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = await res.json();
      expect(body).toMatchObject({
        eia_id: "19791",
        confidence: 1.0,
        match_source: "override",
        canonical_name: "Vermont Electric Cooperative",
        resolver_version: "1.0.0",
      });
      expect(body.candidates).toHaveLength(1);
      expect(body.candidates[0]).toMatchObject({
        eia_id: "19791",
        name: "Vermont Electric Cooperative",
        score: 1.0,
        segment: "distribution",
        state: "VT",
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("uppercases the state parameter before passing it to the resolver", async () => {
      const execute = vi.fn().mockResolvedValue({ rows: [{ result: defaultResolverResult() }] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      await POST(makeRequest({ name: "Vermont Electric", state: "vt" }));

      expect(execute).toHaveBeenCalledTimes(1);
      const callArg = execute.mock.calls[0]?.[0];
      const serialized = JSON.stringify(callArg);
      expect(serialized).toContain("VT");
      expect(serialized).not.toMatch(/"vt"/);
    });

    it("returns the default shape when the DB yields no rows", async () => {
      const execute = vi.fn().mockResolvedValue({ rows: [] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Nonexistent Utility" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        eia_id: null,
        confidence: 0,
        match_source: "none",
        canonical_name: null,
        candidates: [],
        resolver_version: "1.0.0",
      });
    });

    it("coerces string confidence from JSONB into a number", async () => {
      const execute = vi.fn().mockResolvedValue({
        rows: [
          {
            result: {
              eia_id: "19791",
              confidence: "0.92",
              match_source: "fuzzy",
              candidates: [],
              resolver_version: "1.0.0",
            },
          },
        ],
      });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Vermont Electric" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.confidence).toBe("number");
      expect(body.confidence).toBeCloseTo(0.92, 5);
    });

    it("maps legacy match_source values to the public contract vocabulary", async () => {
      const execute = vi.fn().mockResolvedValue({
        rows: [
          {
            result: {
              eia_id: "123",
              confidence: 0.95,
              match_source: "exact_name_match",
              candidates: [{ eia_id: "123", name: "Acme Co", match_score: 0.95 }],
              resolver_version: "1.0.0",
            },
          },
        ],
      });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      const res = await POST(makeRequest({ name: "Acme" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.match_source).toBe("exact");
    });

    it("stitches name + domain when name doesn't already look like an email", async () => {
      const execute = vi.fn().mockResolvedValue({ rows: [{ result: defaultResolverResult() }] });
      vi.mocked(getDb).mockReturnValue({ execute } as never);

      await POST(makeRequest({ name: "Duke Energy", domain: "duke-energy.com" }));

      const callArg = execute.mock.calls[0]?.[0];
      const serialized = JSON.stringify(callArg);
      // The effective name handed to the resolver should contain the @-form.
      expect(serialized).toContain("Duke Energy@duke-energy.com");
    });
  });

  // --- Method gate -------------------------------------------------------
  describe("method gate", () => {
    it("GET is rejected with 405 and Allow: POST", async () => {
      const mod = await import("@/app/api/v1/utilities/resolve/route");
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
