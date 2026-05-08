/**
 * Tests for GET /api/v1/utilities/[slug]/geometry
 * and GET /api/v1/territories/[slug]/geometry.
 *
 * Context: on 2026-05-08 Relay called
 * `/api/v1/territories/vermont-electric-cooperative/geometry` and 404'd
 * because the existing handler matched against `territories.id` only —
 * not a discoverable slug. This test locks in two fixes:
 *
 *   1. New `/api/v1/utilities/{slug}/geometry` endpoint that does the
 *      natural utilities → regions (SERVICE_TERRITORY) → territories
 *      resolution and returns a distinguishing 404 message at each
 *      failure stage.
 *
 *   2. `/api/v1/territories/{slug}/geometry` now accepts both
 *      `territories.id` (legacy) and `regions.slug` (documented) forms.
 *
 * We mock `@/lib/db/client` so the tests are hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be registered before importing routes.
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/client", () => ({
  db: { execute: vi.fn() } as unknown,
  getDb: vi.fn(),
}));

import { GET as getTerritoryGeometry } from "@/app/api/v1/territories/[slug]/geometry/route";
import { GET as getUtilityGeometry } from "@/app/api/v1/utilities/[slug]/geometry/route";
import { db } from "@/lib/db/client";

// A minimal valid GeoJSON MultiPolygon fixture (green-mountain-power-shaped).
const FIXTURE_MULTIPOLYGON = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-72.7, 44.3],
        [-72.4, 44.3],
        [-72.4, 44.6],
        [-72.7, 44.6],
        [-72.7, 44.3],
      ],
    ],
  ],
};

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

const execute =
  db && typeof (db as unknown as { execute: unknown }).execute === "function"
    ? (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute
    : (undefined as never);

// ---------------------------------------------------------------------------
// /api/v1/utilities/[slug]/geometry
// ---------------------------------------------------------------------------

describe("GET /api/v1/utilities/[slug]/geometry", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 with a 'utility not found' message when the slug is unknown", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_eia_id: null,
          region_id: null,
          geojson: null,
          utility_exists: false,
          region_exists: false,
          territory_exists: false,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/this-utility-does-not-exist/geometry"),
      makeParams("this-utility-does-not-exist")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message.toLowerCase()).toContain("utility");
    expect(body.error.message.toLowerCase()).toContain("not found");
  });

  it("returns 404 with a distinct message when the utility exists but has no SERVICE_TERRITORY region", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_eia_id: "99999",
          region_id: null,
          geojson: null,
          utility_exists: true,
          region_exists: false,
          territory_exists: false,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/registered-utility-no-region/geometry"),
      makeParams("registered-utility-no-region")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    // Must clearly distinguish from the "utility not found" case so consumers
    // know the slug is real but geometry isn't loaded yet.
    expect(body.error.message).toMatch(/no service-territory region|not available/i);
  });

  it("returns 404 with a 'geometry not backfilled yet' hint when region exists but territory is missing (VEC canary)", async () => {
    // TODO: flip to 200 assertion once fleet-task 79e6e387-a772-4a96-9311-93db92cc1322
    // ships the geometry backfill for the 71 SERVICE_TERRITORY regions without polygons.
    execute.mockResolvedValue({
      rows: [
        {
          utility_eia_id: "19791",
          region_id: "region-st-19791",
          geojson: null,
          utility_exists: true,
          region_exists: true,
          territory_exists: false,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/vermont-electric-cooperative/geometry"),
      makeParams("vermont-electric-cooperative")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toMatch(/no geometry loaded|has not been backfilled|check back/i);
  });

  it("returns 200 with GeoJSON MultiPolygon for a utility that has territory geometry (green-mountain-power)", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_eia_id: "7601",
          region_id: "region-st-7601",
          geojson: JSON.stringify(FIXTURE_MULTIPOLYGON),
          utility_exists: true,
          region_exists: true,
          territory_exists: true,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry"),
      makeParams("green-mountain-power")
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=86400");
    const body = await res.json();
    expect(body.data).toMatchObject({
      type: "MultiPolygon",
      coordinates: expect.any(Array),
    });
    // Sanity-check we called the DB exactly once.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("applies ST_SimplifyPreserveTopology when ?simplify is provided", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_eia_id: "7601",
          region_id: "region-st-7601",
          geojson: JSON.stringify(FIXTURE_MULTIPOLYGON),
          utility_exists: true,
          region_exists: true,
          territory_exists: true,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry?simplify=0.05"),
      makeParams("green-mountain-power")
    );

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
    // Inspect the Drizzle SQL fragment we issued — it should contain the
    // simplification call (string search on the compiled object's structure).
    const callArg = execute.mock.calls[0]?.[0];
    const serialized = JSON.stringify(callArg);
    expect(serialized).toContain("ST_SimplifyPreserveTopology");
  });
});

// ---------------------------------------------------------------------------
// /api/v1/territories/[slug]/geometry — both slug forms
// ---------------------------------------------------------------------------

describe("GET /api/v1/territories/[slug]/geometry (both slug forms)", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when called with the territory row id (legacy form)", async () => {
    execute.mockResolvedValue({
      rows: [{ geojson: JSON.stringify(FIXTURE_MULTIPOLYGON) }],
    });

    const res = await getTerritoryGeometry(
      makeRequest("https://commongrid.info/api/v1/territories/territory-7601/geometry"),
      makeParams("territory-7601")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe("MultiPolygon");
  });

  it("returns 200 when called with the region slug (new discoverable form)", async () => {
    execute.mockResolvedValue({
      rows: [{ geojson: JSON.stringify(FIXTURE_MULTIPOLYGON) }],
    });

    const res = await getTerritoryGeometry(
      makeRequest("https://commongrid.info/api/v1/territories/st-green-mountain-power-corp-7601/geometry"),
      makeParams("st-green-mountain-power-corp-7601")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe("MultiPolygon");

    // The SQL we issued must check both forms so either slug type works.
    const callArg = execute.mock.calls[0]?.[0];
    const serialized = JSON.stringify(callArg);
    expect(serialized).toContain("t.id");
    expect(serialized).toContain("r.slug");
  });

  it("returns 404 when neither territory.id nor regions.slug matches", async () => {
    execute.mockResolvedValue({ rows: [] });

    const res = await getTerritoryGeometry(
      makeRequest("https://commongrid.info/api/v1/territories/no-such-slug/geometry"),
      makeParams("no-such-slug")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("no-such-slug");
  });
});
