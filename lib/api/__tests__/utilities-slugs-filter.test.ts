/**
 * Tests for the bulk `slugs` filter on GET /api/v1/utilities.
 *
 * Regression context: detail views that hold utility *slugs* (program
 * administrators, plant owners) resolved names by fetching the first 200 of
 * 3,133 utilities alphabetically and doing a client-side `find()`. Any slug
 * past the alphabetical cap resolved to nothing, so the program detail panel
 * rendered a program with a website but no utility at all — reported on
 * "AC Load Management" (administered by `central-georgia-el-member`, which
 * sorts well past position 200).
 *
 * The fix is a server-side `?slugs=a,b,c` filter, so the client asks for
 * exactly the slugs it needs and pagination can never hide a match.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inArrayCalls: { column: unknown; values: unknown }[] = [];

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  return {
    ...actual,
    inArray: (column: unknown, values: unknown) => {
      inArrayCalls.push({ column, values });
      return { __op: "inArray", column, values };
    },
  };
});

/**
 * Minimal Drizzle-shaped query builder: chainable and awaitable.
 *
 * Built by attaching chain methods to a real resolved Promise so the object is
 * thenable without hand-defining a `then` property.
 */
function makeChain<T>(result: T) {
  const chain = Object.assign(Promise.resolve(result), {
    from: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    where: () => chain,
  }) as Promise<T> & {
    from: () => Promise<T> & unknown;
    orderBy: () => Promise<T> & unknown;
    limit: () => Promise<T> & unknown;
    where: () => Promise<T> & unknown;
  };
  return chain;
}

vi.mock("@/lib/db/client", () => ({
  db: {} as unknown,
  getDb: () => ({
    // The route runs a data query (no projection arg) then a count query
    // (projection arg). Both are chainable + awaitable.
    select: (projection?: unknown) =>
      projection === undefined ? makeChain<Record<string, unknown>[]>([]) : makeChain([{ count: 0 }]),
  }),
}));

import { GET } from "@/app/api/v1/utilities/route";

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

/** All value sets passed to any inArray() call during the request. */
function inArrayValueSets(): unknown[][] {
  return inArrayCalls.map((c) => c.values as unknown[]);
}

const SLUGS_URL = "https://commongrid.info/api/v1/utilities?slugs=";

describe("GET /api/v1/utilities?slugs=", () => {
  beforeEach(() => {
    inArrayCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("filters by an exact slug list", async () => {
    const res = await GET(makeRequest(`${SLUGS_URL}central-georgia-el-member,oconto-electric-cooperative`) as never);

    expect(res.status).toBe(200);
    expect(inArrayValueSets()).toContainEqual(["central-georgia-el-member", "oconto-electric-cooperative"]);
  });

  it("lower-cases, trims, and de-duplicates slugs", async () => {
    const res = await GET(
      makeRequest(
        `${SLUGS_URL}%20Central-Georgia-El-Member%20,central-georgia-el-member,CENTRAL-GEORGIA-EL-MEMBER`
      ) as never
    );

    expect(res.status).toBe(200);
    expect(inArrayValueSets()).toContainEqual(["central-georgia-el-member"]);
  });

  it("caps the slug list at 500 entries", async () => {
    const many = Array.from({ length: 750 }, (_, i) => `utility-${String(i).padStart(4, "0")}`);
    const res = await GET(makeRequest(`${SLUGS_URL}${many.join(",")}`) as never);

    expect(res.status).toBe(200);
    const slugSet = inArrayValueSets().find((v) => Array.isArray(v) && v[0] === "utility-0000");
    expect(slugSet).toBeDefined();
    expect(slugSet).toHaveLength(500);
  });

  it("ignores an empty slugs param rather than matching nothing", async () => {
    const res = await GET(makeRequest(SLUGS_URL) as never);

    expect(res.status).toBe(200);
    expect(inArrayValueSets()).toHaveLength(0);
  });

  it("does not interfere with the eiaIds bulk filter", async () => {
    const res = await GET(
      makeRequest("https://commongrid.info/api/v1/utilities?eiaIds=3046,19791&slugs=duke-energy-carolinas") as never
    );

    expect(res.status).toBe(200);
    expect(inArrayValueSets()).toContainEqual(["3046", "19791"]);
    expect(inArrayValueSets()).toContainEqual(["duke-energy-carolinas"]);
  });
});
