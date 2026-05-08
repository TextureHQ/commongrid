/**
 * Tests for:
 *   GET /api/v1/utilities/[slug]/geometry   (new public endpoint)
 *   GET /api/v1/territories/[slug]/geometry (slug-form compatibility)
 *
 * Context: on 2026-05-08 Atlas's Relay frontend called
 *   /api/v1/territories/vermont-electric-cooperative/geometry
 * and 404'd — the existing territories handler only matched `territories.id`,
 * never a public slug. These tests lock in the contract we agreed in
 * #agent-ops with Atlas / Talos / Lyra:
 *
 *   1. New `/api/v1/utilities/{slug}/geometry`:
 *        - 404 `{ error: "utility_not_found", slug }` for unknown slugs
 *        - 200 FeatureCollection with `metadata.geometry_status: "pending_backfill"`
 *          + empty `features` for utilities whose polygon is not loaded yet
 *          (the 71 SERVICE_TERRITORY regions, including VEC as of 2026-05-08)
 *        - 200 FeatureCollection with `metadata.geometry_status: "loaded"` +
 *          one `Feature<MultiPolygon>` for utilities with geometry
 *        - `Content-Type: application/geo+json`, ETag, cache headers that
 *          differentiate loaded (1h) vs pending (5m)
 *
 *   2. `/api/v1/territories/{slug}/geometry` accepts both `regions.slug`
 *      (primary / documented form) and `territories.id` (legacy fallback).
 *
 * We mock `@/lib/db/client` so tests are hermetic.
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

// Minimal valid GeoJSON MultiPolygon fixture (GMP-shaped).
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

  it("returns flat 404 { error: 'utility_not_found', slug } when the slug is unknown", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_exists: false,
          region_exists: false,
          territory_exists: false,
          utility_id: null,
          utility_slug: null,
          utility_name: null,
          eia_id: null,
          region_id: null,
          region_slug: null,
          territory_id: null,
          territory_source: null,
          territory_source_url: null,
          area_sq_km: null,
          updated_at: null,
          geojson: null,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/does-not-exist/geometry"),
      makeParams("does-not-exist")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "utility_not_found", slug: "does-not-exist" });
  });

  it("returns 200 + empty features + geometry_status='pending_backfill' when utility exists but region is missing", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_exists: true,
          region_exists: false,
          territory_exists: false,
          utility_id: "utility-99999",
          utility_slug: "registered-utility-no-region",
          utility_name: "Registered Utility No Region",
          eia_id: "99999",
          region_id: null,
          region_slug: null,
          territory_id: null,
          territory_source: null,
          territory_source_url: null,
          area_sq_km: null,
          updated_at: null,
          geojson: null,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/registered-utility-no-region/geometry"),
      makeParams("registered-utility-no-region")
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(res.headers.get("Content-Type")).toContain("application/geo+json");
    expect(res.headers.get("ETag")).toBeTruthy();

    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toEqual([]);
    expect(body.metadata).toMatchObject({
      utility_slug: "registered-utility-no-region",
      eia_id: "99999",
      geometry_status: "pending_backfill",
      source: null,
    });
  });

  it("returns 200 + empty features + geometry_status='pending_backfill' when region exists but territory polygon is missing (VEC canary)", async () => {
    // This is the Vermont Electric Cooperative case that prompted the whole
    // endpoint. Region metadata exists; polygon has not been backfilled yet.
    // Flipped to the "loaded" assertion path once the 71-region backfill
    // fleet-task completes.
    execute.mockResolvedValue({
      rows: [
        {
          utility_exists: true,
          region_exists: true,
          territory_exists: false,
          utility_id: "utility-19791",
          utility_slug: "vermont-electric-cooperative",
          utility_name: "Vermont Electric Cooperative",
          eia_id: "19791",
          region_id: "region-st-19791",
          region_slug: "st-vermont-electric-cooperative-inc-19791",
          territory_id: null,
          territory_source: null,
          territory_source_url: null,
          area_sq_km: null,
          updated_at: null,
          geojson: null,
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/vermont-electric-cooperative/geometry"),
      makeParams("vermont-electric-cooperative")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toEqual([]);
    expect(body.metadata).toMatchObject({
      utility_slug: "vermont-electric-cooperative",
      eia_id: "19791",
      region_slug: "st-vermont-electric-cooperative-inc-19791",
      geometry_status: "pending_backfill",
      source: null,
    });
    // Pending uses the short cache window so backfills propagate quickly.
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns 200 + loaded FeatureCollection for a utility with geometry (green-mountain-power)", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_exists: true,
          region_exists: true,
          territory_exists: true,
          utility_id: "utility-7601",
          utility_slug: "green-mountain-power",
          utility_name: "Green Mountain Power",
          eia_id: "7601",
          region_id: "region-st-7601",
          region_slug: "st-green-mountain-power-corp-7601",
          territory_id: "territory-7601",
          territory_source: "HIFLD",
          territory_source_url: "https://hifld-geoplatform.opendata.arcgis.com/...",
          area_sq_km: 24906.5,
          updated_at: "2026-03-01T00:00:00.000Z",
          geojson: JSON.stringify(FIXTURE_MULTIPOLYGON),
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry"),
      makeParams("green-mountain-power")
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("Content-Type")).toContain("application/geo+json");
    expect(res.headers.get("ETag")).toBeTruthy();

    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(1);

    const feature = body.features[0];
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("MultiPolygon");
    expect(feature.geometry.coordinates).toEqual(FIXTURE_MULTIPOLYGON.coordinates);
    expect(feature.properties).toMatchObject({
      utility_slug: "green-mountain-power",
      utility_name: "Green Mountain Power",
      eia_id: "7601",
      region_slug: "st-green-mountain-power-corp-7601",
      territory_id: "territory-7601",
    });

    expect(body.metadata).toMatchObject({
      utility_slug: "green-mountain-power",
      eia_id: "7601",
      region_slug: "st-green-mountain-power-corp-7601",
      territory_id: "territory-7601",
      geometry_status: "loaded",
      source: "HIFLD",
      area_sq_km: 24906.5,
    });

    // Sanity-check we issued exactly one DB round-trip.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("produces different ETags for loaded vs pending states (same utility_id)", async () => {
    // Loaded response
    execute.mockResolvedValueOnce({
      rows: [
        {
          utility_exists: true,
          region_exists: true,
          territory_exists: true,
          utility_id: "utility-7601",
          utility_slug: "green-mountain-power",
          utility_name: "Green Mountain Power",
          eia_id: "7601",
          region_id: "region-st-7601",
          region_slug: "st-green-mountain-power-corp-7601",
          territory_id: "territory-7601",
          territory_source: "HIFLD",
          territory_source_url: null,
          area_sq_km: 24906.5,
          updated_at: "2026-03-01T00:00:00.000Z",
          geojson: JSON.stringify(FIXTURE_MULTIPOLYGON),
        },
      ],
    });
    const loaded = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry"),
      makeParams("green-mountain-power")
    );

    // Pending response (same utility_id, different status).
    execute.mockResolvedValueOnce({
      rows: [
        {
          utility_exists: true,
          region_exists: true,
          territory_exists: false,
          utility_id: "utility-7601",
          utility_slug: "green-mountain-power",
          utility_name: "Green Mountain Power",
          eia_id: "7601",
          region_id: "region-st-7601",
          region_slug: "st-green-mountain-power-corp-7601",
          territory_id: null,
          territory_source: null,
          territory_source_url: null,
          area_sq_km: null,
          updated_at: null,
          geojson: null,
        },
      ],
    });
    const pending = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry"),
      makeParams("green-mountain-power")
    );

    const loadedEtag = loaded.headers.get("ETag");
    const pendingEtag = pending.headers.get("ETag");
    expect(loadedEtag).toBeTruthy();
    expect(pendingEtag).toBeTruthy();
    expect(loadedEtag).not.toBe(pendingEtag);
  });

  it("applies ST_SimplifyPreserveTopology when ?simplify is provided", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          utility_exists: true,
          region_exists: true,
          territory_exists: true,
          utility_id: "utility-7601",
          utility_slug: "green-mountain-power",
          utility_name: "Green Mountain Power",
          eia_id: "7601",
          region_id: "region-st-7601",
          region_slug: "st-green-mountain-power-corp-7601",
          territory_id: "territory-7601",
          territory_source: "HIFLD",
          territory_source_url: null,
          area_sq_km: 24906.5,
          updated_at: "2026-03-01T00:00:00.000Z",
          geojson: JSON.stringify(FIXTURE_MULTIPOLYGON),
        },
      ],
    });

    const res = await getUtilityGeometry(
      makeRequest("https://commongrid.info/api/v1/utilities/green-mountain-power/geometry?simplify=0.05"),
      makeParams("green-mountain-power")
    );

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
    const callArg = execute.mock.calls[0]?.[0];
    expect(JSON.stringify(callArg)).toContain("ST_SimplifyPreserveTopology");
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
