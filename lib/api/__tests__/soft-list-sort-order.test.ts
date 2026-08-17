/**
 * Soft list routes (parsePaginationParams) and changelog must reject invalid
 * sort / order / kind with 400 VALIDATION_ERROR — same contract as Zod routes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {} as unknown,
  getDb: vi.fn(),
}));

import { GET as getBalancingAuthorities } from "@/app/api/v1/balancing-authorities/route";
import { GET as getChangelog } from "@/app/api/v1/changelog/route";
import { GET as getIsos } from "@/app/api/v1/isos/route";
import { GET as getRegions } from "@/app/api/v1/regions/route";
import { GET as getRtos } from "@/app/api/v1/rtos/route";
import { GET as getTerritories } from "@/app/api/v1/territories/route";
import { GET as getUtilities } from "@/app/api/v1/utilities/route";
import { getDb } from "@/lib/db/client";

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

async function expectValidationError(
  res: Response,
  field: string,
  messageMatch: RegExp
): Promise<void> {
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.message).toMatch(messageMatch);
  expect(body.error.details).toMatchObject({ field });
  expect(getDb).not.toHaveBeenCalled();
}

describe("soft list sort/order validation", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /utilities", () => {
    it("rejects invalid sort", async () => {
      const res = await getUtilities(
        makeRequest("https://commongrid.info/api/v1/utilities?sort=popularity") as never
      );
      await expectValidationError(res, "sort", /customerCount/);
    });

    it("rejects invalid order", async () => {
      const res = await getUtilities(
        makeRequest("https://commongrid.info/api/v1/utilities?order=up") as never
      );
      await expectValidationError(res, "order", /asc.*desc/);
    });
  });

  describe("GET /isos", () => {
    it("rejects invalid sort", async () => {
      const res = await getIsos(makeRequest("https://commongrid.info/api/v1/isos?sort=code") as never);
      await expectValidationError(res, "sort", /shortName/);
    });
  });

  describe("GET /rtos", () => {
    it("rejects invalid sort", async () => {
      const res = await getRtos(makeRequest("https://commongrid.info/api/v1/rtos?sort=code") as never);
      await expectValidationError(res, "sort", /shortName/);
    });
  });

  describe("GET /balancing-authorities", () => {
    it("rejects invalid sort", async () => {
      const res = await getBalancingAuthorities(
        makeRequest("https://commongrid.info/api/v1/balancing-authorities?sort=code") as never
      );
      await expectValidationError(res, "sort", /shortName/);
    });
  });

  describe("GET /regions", () => {
    it("rejects invalid sort", async () => {
      const res = await getRegions(
        makeRequest("https://commongrid.info/api/v1/regions?sort=population") as never
      );
      await expectValidationError(res, "sort", /type/);
    });
  });

  describe("GET /territories", () => {
    it("rejects invalid sort", async () => {
      const res = await getTerritories(
        makeRequest("https://commongrid.info/api/v1/territories?sort=area") as never
      );
      await expectValidationError(res, "sort", /state/);
    });

    it("rejects invalid order", async () => {
      const res = await getTerritories(
        makeRequest("https://commongrid.info/api/v1/territories?order=random") as never
      );
      await expectValidationError(res, "order", /asc.*desc/);
    });
  });
});

describe("GET /changelog kind validation", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid kind with 400 VALIDATION_ERROR", async () => {
    const res = await getChangelog(
      makeRequest("https://commongrid.info/api/v1/changelog?kind=deleted") as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/kind must be one of/);
    expect(body.error.details).toMatchObject({ field: "kind", invalid: ["deleted"] });
  });
});
