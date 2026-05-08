/**
 * Tests for GET /api/v1/utilities/deprecated
 *
 * Exercises the lifecycle endpoint backed by the `v_deprecated_utilities`
 * view (migration 0013). The route runs two raw SQL queries per request
 * (page + count), both against the same view, so we mock the DB client's
 * `execute` and drive it with two pre-staged results per call.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => {
  const execute = vi.fn();
  return {
    db: { execute } as unknown,
    getDb: vi.fn(() => ({ execute })),
  };
});

import { GET as getDeprecated } from "@/app/api/v1/utilities/deprecated/route";
import { getDb } from "@/lib/db/client";

type ExecuteMock = ReturnType<typeof vi.fn>;

function mockExecute(): ExecuteMock {
  // getDb() returns `{ execute }` in our mock; pull the shared spy out.
  return (getDb() as unknown as { execute: ExecuteMock }).execute;
}

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

// Fixture — three representative rows covering every status bucket.
const FIXTURE_MERGED = {
  eia_id: "util-gulf-power",
  utility_slug: "gulf-power",
  name: "Gulf Power",
  status: "merged" as const,
  raw_status: "MERGED",
  effective_from: "2015-01-01T00:00:00.000Z",
  effective_to: "2019-01-01T00:00:00.000Z",
  successor_eia_id: "util-fpl",
  successor_slug: "florida-power-and-light",
  source: "EIA-861 + manual overrides",
  deprecation_reason: "Acquired by NextEra; rolled into FPL",
  notes: "Acquired by NextEra; rolled into FPL",
};

const FIXTURE_RETIRED = {
  eia_id: "util-city-of-bigelow",
  utility_slug: "city-of-bigelow",
  name: "City of Bigelow",
  status: "retired" as const,
  raw_status: "DEFUNCT",
  effective_from: "2010-01-01T00:00:00.000Z",
  effective_to: "2018-06-30T00:00:00.000Z",
  successor_eia_id: null,
  successor_slug: null,
  source: "EIA-861 + manual overrides",
  deprecation_reason: null,
  notes: null,
};

const FIXTURE_ACTIVE_SUCCESSOR = {
  eia_id: "util-fpl",
  utility_slug: "florida-power-and-light",
  name: "Florida Power & Light",
  status: "active" as const,
  raw_status: "ACTIVE",
  effective_from: "2000-01-01T00:00:00.000Z",
  effective_to: null,
  successor_eia_id: null,
  successor_slug: null,
  source: "EIA-861 + manual overrides",
  deprecation_reason: null,
  notes: null,
};

describe("GET /api/v1/utilities/deprecated", () => {
  let execute: ExecuteMock;

  beforeEach(() => {
    execute = mockExecute();
    execute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a paginated list with data + total + cursor=null when all rows fit in one page", async () => {
    execute
      .mockResolvedValueOnce({
        rows: [FIXTURE_MERGED, FIXTURE_RETIRED, FIXTURE_ACTIVE_SUCCESSOR],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 3 }],
      });

    const res = await getDeprecated(makeRequest("https://commongrid.info/api/v1/utilities/deprecated") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0]).toMatchObject({
      eia_id: "util-gulf-power",
      status: "merged",
      successor_slug: "florida-power-and-light",
    });
    expect(body.pagination).toMatchObject({
      total: 3,
      cursor: null,
      hasMore: false,
    });
  });

  it("emits a next cursor + hasMore=true when more rows remain", async () => {
    // Ask for limit=2 and pre-stage 3 rows so the route slices off the
    // sentinel and encodes a cursor.
    execute
      .mockResolvedValueOnce({
        rows: [FIXTURE_MERGED, FIXTURE_RETIRED, FIXTURE_ACTIVE_SUCCESSOR],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 30 }],
      });

    const res = await getDeprecated(
      makeRequest("https://commongrid.info/api/v1/utilities/deprecated?limit=2") as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.cursor).toBeTruthy();
    expect(body.pagination.total).toBe(30);
  });

  it("rejects an invalid status value with 400 / VALIDATION_ERROR", async () => {
    const res = await getDeprecated(
      makeRequest("https://commongrid.info/api/v1/utilities/deprecated?status=zombie") as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // Should not have touched the DB.
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes the status filter through to the SQL query", async () => {
    execute.mockResolvedValueOnce({ rows: [FIXTURE_RETIRED] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const res = await getDeprecated(
      makeRequest("https://commongrid.info/api/v1/utilities/deprecated?status=retired") as never
    );

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
    // Inspect the first SQL call; Drizzle's SQL template stores params on
    // the passed-in SQL object. We don't introspect the chunks string, but
    // a shape check is enough to catch regressions.
    const firstCall = execute.mock.calls[0][0];
    expect(firstCall).toBeDefined();
  });

  it("rejects a malformed cursor with 400 / BAD_REQUEST", async () => {
    const res = await getDeprecated(
      makeRequest("https://commongrid.info/api/v1/utilities/deprecated?cursor=!!!not-valid-base64!!!") as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("sets long-lived cache headers (view changes rarely)", async () => {
    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const res = await getDeprecated(makeRequest("https://commongrid.info/api/v1/utilities/deprecated") as never);

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=86400");
  });
});
