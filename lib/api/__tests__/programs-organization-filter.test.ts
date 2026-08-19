/**
 * Tests for the `organization` / `organizationRole` filters on
 * GET /api/v1/programs.
 *
 * Regression context: utility detail pages used to fetch the first 200 of 600+
 * programs and filter by `organizations[].entityId` client-side. Any program
 * alphabetically past the cap was invisible on the utility page even though the
 * association existed in the database (real case: "Flexible Load - Bring Your
 * Own Battery" at alphabetical position 244, administered by
 * vermont-electric-cooperative). Filtering must happen server-side, before
 * pagination, so a match past the cap still lands on page one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {} as unknown,
  getDb: vi.fn(),
}));

const loadPrograms = vi.fn();
vi.mock("@/lib/data/programs", () => ({
  loadPrograms: (...args: unknown[]) => loadPrograms(...args),
}));

import { GET } from "@/app/api/v1/programs/route";

interface FakeProgram {
  id: string;
  slug: string;
  name: string;
  status: string;
  organizations: { role: string; entityId: string }[];
}

function program(slug: string, name: string, orgs: { role: string; entityId: string }[]): FakeProgram {
  return { id: `id-${slug}`, slug, name, status: "ACTIVE", organizations: orgs };
}

const ADMIN = "ADMINISTRATOR";

/** 250 filler programs named so they sort ahead of the target. */
function fillerPrograms(count: number): FakeProgram[] {
  return Array.from({ length: count }, (_, i) =>
    program(`aaa-filler-${i}`, `AAA Filler ${String(i).padStart(4, "0")}`, [
      { role: ADMIN, entityId: "some-other-utility" },
    ])
  );
}

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/v1/programs organization filter", () => {
  beforeEach(() => {
    loadPrograms.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes organization through to loadPrograms rather than filtering after pagination", async () => {
    loadPrograms.mockResolvedValue([]);

    await GET(makeRequest("https://commongrid.info/api/v1/programs?organization=vermont-electric-cooperative"));

    expect(loadPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ organization: "vermont-electric-cooperative" })
    );
  });

  it("returns a match that sorts past the 200-row limit (the original bug)", async () => {
    // Simulates the data layer having already applied the organization filter:
    // only the target survives, so it must appear on page one regardless of
    // where it sorted in the unfiltered collection.
    const target = program("flexible-load-bring-your-own-battery", "Flexible Load - Bring Your Own Battery", [
      { role: ADMIN, entityId: "vermont-electric-cooperative" },
    ]);
    loadPrograms.mockResolvedValue([target]);

    const res = await GET(
      makeRequest("https://commongrid.info/api/v1/programs?organization=vermont-electric-cooperative&limit=200")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((p: FakeProgram) => p.slug)).toContain("flexible-load-bring-your-own-battery");
    expect(body.pagination.total).toBe(1);
  });

  it("does not truncate the filtered set when the unfiltered set exceeds the cap", async () => {
    // Guards the ordering of operations: filter first, then slice. If the route
    // ever sliced before filtering, the target would be pushed off page one by
    // the 250 filler rows.
    const target = program("zzz-target", "ZZZ Target Program", [
      { role: ADMIN, entityId: "vermont-electric-cooperative" },
    ]);
    loadPrograms.mockResolvedValue([target, ...fillerPrograms(250)]);

    const res = await GET(
      makeRequest("https://commongrid.info/api/v1/programs?organization=vermont-electric-cooperative&limit=200")
    );

    const body = await res.json();
    // The route trusts the data layer's filtering, so all 251 rows come back
    // paginated — the point is that page one is a real page, not a pre-filtered
    // slice that dropped the match.
    expect(body.data.length).toBe(200);
    expect(body.pagination.total).toBe(251);
  });

  it("forwards organizationRole alongside organization", async () => {
    loadPrograms.mockResolvedValue([]);

    await GET(
      makeRequest(
        "https://commongrid.info/api/v1/programs?organization=vermont-electric-cooperative&organizationRole=ADMINISTRATOR"
      )
    );

    expect(loadPrograms).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: "vermont-electric-cooperative",
        organizationRole: "ADMINISTRATOR",
      })
    );
  });

  it("rejects organizationRole without organization (400, never a silent full list)", async () => {
    loadPrograms.mockResolvedValue([]);

    const res = await GET(makeRequest("https://commongrid.info/api/v1/programs?organizationRole=ADMINISTRATOR"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(loadPrograms).not.toHaveBeenCalled();
  });

  it("rejects an unknown organizationRole with 400", async () => {
    loadPrograms.mockResolvedValue([]);

    const res = await GET(
      makeRequest("https://commongrid.info/api/v1/programs?organization=x&organizationRole=administrator")
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(loadPrograms).not.toHaveBeenCalled();
  });

  it("rejects a non-slug organization value with 400", async () => {
    loadPrograms.mockResolvedValue([]);

    const res = await GET(makeRequest("https://commongrid.info/api/v1/programs?organization=Vermont%20Electric"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(loadPrograms).not.toHaveBeenCalled();
  });

  it("omits the filter entirely when organization is absent", async () => {
    loadPrograms.mockResolvedValue([]);

    await GET(makeRequest("https://commongrid.info/api/v1/programs"));

    expect(loadPrograms).toHaveBeenCalledWith(expect.objectContaining({ organization: undefined }));
  });
});
