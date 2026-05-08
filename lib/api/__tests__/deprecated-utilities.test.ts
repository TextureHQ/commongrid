/**
 * Tests for GET /api/v1/utilities/deprecated
 *
 * Route under test: `app/api/v1/utilities/deprecated/route.ts`.
 *
 * Public endpoint; same contract as every other /api/v1/* route.
 * We exercise:
 *   - request validation (400 branches for bad `since`, `state`, `limit`, `offset`)
 *   - happy path (200 branch)
 *   - response shape + cache headers
 *   - pagination metadata
 *
 * We mock the Drizzle DB client so the tests stay hermetic (no DATABASE_URL
 * required). Since the route builds a drizzle query builder chain, we
 * stub the builder with a tiny fluent mock that captures the final
 * resolved rows / count.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
  db: null,
}));

import { GET } from "@/app/api/v1/utilities/deprecated/route";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(query: string = ""): Request {
  const qs = query && !query.startsWith("?") ? `?${query}` : query;
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest type cast for tests
  return new Request(`https://commongrid.info/api/v1/utilities/deprecated${qs}`) as any;
}

interface StubRow {
  eiaId: string | null;
  slug: string;
  name: string;
  state: string | null;
  deprecatedAt: string;
  successorEiaId: string | null;
  deprecationReason: string | null;
}

/**
 * Builds a minimal fluent drizzle-query-builder stub. The route calls
 * `.select().from()`... — we just need both chains (count + rows) to
 * resolve to well-shaped arrays.
 */
function stubDb(countRow: { count: number }, dataRows: StubRow[]) {
  const countChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([countRow]),
    }),
  };

  const dataChain = {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(dataRows),
            }),
          }),
        }),
      }),
    }),
  };

  const db = {
    select: vi.fn().mockImplementation((projection?: Record<string, unknown>) => {
      // Heuristic: count query passes `{ count: ... }`; data query passes the
      // full projection (eiaId, slug, name, ...).
      if (projection && Object.keys(projection).length === 1 && "count" in projection) {
        return countChain;
      }
      return dataChain;
    }),
  };

  return { db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/utilities/deprecated", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation / 400 branches -----------------------------------------
  describe("request validation", () => {
    it("returns 400 when limit is non-integer", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("limit=1.5") as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 when limit is out of range", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("limit=501") as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/limit/);
    });

    it("returns 400 when limit is zero or negative", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("limit=0") as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when offset is negative", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("offset=-1") as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when offset is non-integer", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("offset=abc") as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when since is not a valid ISO timestamp", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("since=not-a-date") as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/since/);
    });

    it("returns 400 when state is not a 2-letter code", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("state=California") as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/state/);
    });
  });

  // --- Happy path --------------------------------------------------------
  describe("happy path", () => {
    const sampleRow: StubRow = {
      eiaId: "12345",
      slug: "old-utility-co",
      name: "Old Utility Co",
      state: "VT",
      deprecatedAt: "2025-06-15T00:00:00.000Z",
      successorEiaId: "67890",
      deprecationReason: "merged into successor",
    };

    it("returns 200 with empty data when no deprecated utilities exist", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination).toEqual({ total: 0, limit: 100, offset: 0 });
    });

    it("returns 200 with deprecated utilities and correct shape", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 1 }, [sampleRow]).db as never);
      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toEqual({
        eia_id: "12345",
        slug: "old-utility-co",
        name: "Old Utility Co",
        state: "VT",
        deprecated_at: "2025-06-15T00:00:00.000Z",
        successor_eia_id: "67890",
        deprecation_reason: "merged into successor",
      });
      expect(body.pagination).toEqual({ total: 1, limit: 100, offset: 0 });
    });

    it("respects custom limit and offset parameters", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 42 }, [sampleRow]).db as never);
      const res = await GET(makeRequest("limit=25&offset=50") as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.pagination).toEqual({ total: 42, limit: 25, offset: 50 });
    });

    it("accepts valid since and state filters without error", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest("since=2025-01-01T00:00:00Z&state=vt") as never);
      expect(res.status).toBe(200);
    });

    it("returns Cache-Control public with s-maxage and stale-while-revalidate", async () => {
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 0 }, []).db as never);
      const res = await GET(makeRequest() as never);
      const cc = res.headers.get("Cache-Control") ?? "";
      expect(cc).toContain("public");
      expect(cc).toContain("s-maxage=3600");
      expect(cc).toContain("stale-while-revalidate=86400");
    });

    it("normalizes Postgres-format timestamps to ISO 8601", async () => {
      // Postgres returns the `COALESCE(...)` expression as a raw text string
      // (e.g. `2026-04-15 16:22:32.101053+00`), which is NOT valid ISO 8601.
      // The route wraps every `deprecatedAt` in `new Date(...)` before
      // `.toISOString()` precisely to coerce this form to the canonical
      // `YYYY-MM-DDTHH:mm:ss.sssZ` layout every consumer expects.
      const postgresFormatRow: StubRow = {
        eiaId: "19791",
        slug: "pg-format-utility",
        name: "PG Format Utility",
        state: "KS",
        deprecatedAt: "2026-04-15 16:22:32.101053+00",
        successorEiaId: null,
        deprecationReason: null,
      };
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 1 }, [postgresFormatRow]).db as never);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].deprecated_at).toBe("2026-04-15T16:22:32.101Z");
      // Sanity-check: the output MUST be parseable as a Date again and round-trip.
      expect(new Date(body.data[0].deprecated_at).toISOString()).toBe(body.data[0].deprecated_at);
    });

    it("handles nullable fields (eia_id, successor_eia_id, deprecation_reason)", async () => {
      const rowWithNulls: StubRow = {
        eiaId: null,
        slug: "unknown-defunct-utility",
        name: "Unknown Defunct Utility",
        state: null,
        deprecatedAt: "2024-01-01T00:00:00.000Z",
        successorEiaId: null,
        deprecationReason: null,
      };
      vi.mocked(getDb).mockReturnValue(stubDb({ count: 1 }, [rowWithNulls]).db as never);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].eia_id).toBeNull();
      expect(body.data[0].state).toBeNull();
      expect(body.data[0].successor_eia_id).toBeNull();
      expect(body.data[0].deprecation_reason).toBeNull();
    });
  });

  // --- DB not configured -------------------------------------------------
  describe("db not configured", () => {
    it("returns 500 when getDb returns null", async () => {
      vi.mocked(getDb).mockReturnValue(null as never);
      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
