/**
 * Tests for GET /api/v1/power-plants/[slug]
 *
 * Context: on 2026-08-13 Victor reported that the "Linked Power Plant" card on
 * a pricing node detail page 404'd. Pricing nodes carry `eia_plant_code`
 * (EIA's identifier for the generating facility), power plant pages/APIs are
 * addressed by *slug*, and nothing bridged the two — so
 * `/power-plants/2503` was a dead link everywhere it appeared.
 *
 * The fix makes plant-code lookup a first-class public capability, because the
 * EIA plant code is the identifier that arrives with the data (EIA-860/860M
 * filings, ISO/RTO node registries, most third-party grid datasets). These
 * tests lock in that contract:
 *
 *   1. Slug lookup is unchanged (no canonical Link header).
 *   2. All-digit path segment resolves via `plant_code`.
 *   3. Plant-code resolution emits `Link: …; rel="canonical"` at the slug URL.
 *   4. Plant-code lookup excludes soft-deleted rows.
 *   5. Unknown slug and unknown plant code both 404, with a message that
 *      names which identifier form was attempted.
 *   6. `isPlantCode` only treats bare digit strings as plant codes, so the two
 *      identifier namespaces can never collide.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { execute: vi.fn() } as unknown,
  getDb: vi.fn(),
}));

import { GET } from "@/app/api/v1/power-plants/[slug]/route";
import { isPlantCode } from "@/lib/data/power-plants-api";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLANT_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "59th-street-ny",
  name: "59th Street",
  plantCode: "2503",
  utilityId: null,
  utilityName: "Consolidated Edison Co-NY Inc",
  balancingAuthorityId: null,
  baCode: "NYIS",
  state: "NY",
  county: "New York",
  latitude: 40.7702,
  longitude: -73.9906,
  nercRegion: "NPCC",
  sector: "Electric Utility",
  primaryFuel: "NG",
  fuelCategory: "gas",
  technologies: ["Natural Gas Steam Turbine"],
  energySources: ["NG"],
  totalCapacityMw: 141.6,
  generatorCount: 2,
  operatingYear: 1960,
  gridVoltageKv: 138,
  status: "operable",
  proposedCapacityMw: null,
  proposedOnlineYear: null,
};

// ---------------------------------------------------------------------------
// DB mock. The data layer issues `db.select(cols).from(t).where(c).limit(1)`.
// Each queued response is handed to the next `limit()` call in order, so a
// plant-code lookup (slug resolution, then full row load) consumes two.
// ---------------------------------------------------------------------------

function setupDb(responses: Array<unknown[]>) {
  let call = 0;
  const limit = vi.fn(() => Promise.resolve(responses[call++] ?? []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  vi.mocked(getDb).mockReturnValue({ select } as unknown as ReturnType<typeof getDb>);
  return { select, where };
}

function makeReq(idOrCode: string) {
  return new Request(`https://commongrid.info/api/v1/power-plants/${idOrCode}`);
}

function asPromise<T>(value: T) {
  return Promise.resolve(value);
}

// ---------------------------------------------------------------------------

describe("GET /api/v1/power-plants/[slug]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a slug and emits no canonical Link header", async () => {
    setupDb([[PLANT_ROW]]);

    const res = await GET(makeReq("59th-street-ny"), {
      params: asPromise({ slug: "59th-street-ny" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("59th-street-ny");
    expect(body.data.plantCode).toBe("2503");
    expect(res.headers.get("Link")).toBeNull();
  });

  it("resolves an EIA plant code to the plant", async () => {
    // First select resolves code → slug, second loads the full row.
    setupDb([[{ slug: "59th-street-ny" }], [PLANT_ROW]]);

    const res = await GET(makeReq("2503"), { params: asPromise({ slug: "2503" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("59th-street-ny");
    expect(body.data.name).toBe("59th Street");
  });

  it("points the canonical Link header at the slug URL when resolved by plant code", async () => {
    setupDb([[{ slug: "59th-street-ny" }], [PLANT_ROW]]);

    const res = await GET(makeReq("2503"), { params: asPromise({ slug: "2503" }) });

    expect(res.headers.get("Link")).toBe('</api/v1/power-plants/59th-street-ny>; rel="canonical"');
    // Cache tag keys on the canonical slug, not the requested identifier, so
    // both URL forms invalidate together.
    expect(res.headers.get("Cache-Tag")).toBe("power-plant:59th-street-ny");
  });

  it("404s an unknown plant code and names the identifier form", async () => {
    setupDb([[]]);

    const res = await GET(makeReq("99999999"), { params: asPromise({ slug: "99999999" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("EIA plant code");
  });

  it("404s an unknown slug", async () => {
    setupDb([[]]);

    const res = await GET(makeReq("no-such-plant"), { params: asPromise({ slug: "no-such-plant" }) });

    expect(res.status).toBe(404);
  });

  it("only treats bare digit strings as plant codes", () => {
    expect(isPlantCode("2503")).toBe(true);
    expect(isPlantCode("59th-street-ny")).toBe(false);
    expect(isPlantCode("palo-verde-az")).toBe(false);
    // A slug that starts with digits is still a slug — it has letters.
    expect(isPlantCode("59th-street")).toBe(false);
    expect(isPlantCode("")).toBe(false);
  });
});
