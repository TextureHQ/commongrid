/**
 * Regression tests for `stripInternal` / `publicJsonResponse` /
 * `publicPaginatedResponse`.
 *
 * These guard the invariant that public API responses never leak fields
 * listed in `INTERNAL_FIELDS` (submittedBy, reviewedAt, searchVector,
 * notionPageId, etc.). If a future refactor accidentally bypasses the
 * sanitizer, these tests catch it before it ships.
 *
 * Origin: Morgan's Relay bug report (2026-05-06), bug #1 residual.
 * See memory/specs/relay-commongrid-bugs-2026-05-06.md in the agent workspace.
 */
import { describe, expect, it } from "vitest";

import { INTERNAL_FIELDS } from "../internal-fields";
import {
  parseFieldsParam,
  publicJsonResponse,
  publicPaginatedResponse,
  selectFields,
  stripInternal,
} from "../public-response";

describe("stripInternal", () => {
  it("removes every field listed in INTERNAL_FIELDS from a single object", () => {
    const input = {
      id: "util_abc",
      name: "Green Mountain Power",
      slug: "green-mountain-power",
      // Internal fields that must be stripped.
      submittedBy: "user_xyz",
      reviewedAt: "2026-01-01T00:00:00Z",
      reviewedBy: "mod_abc",
      lockedStatus: "unlocked",
      searchVector: "'green':1 'mountain':2 'power':3",
      notionPageId: "util_abc",
      geography: Buffer.from("binary-blob"),
      geometry: Buffer.from("binary-blob"),
      simplified1km: "…",
      centroid: [-72.5, 44.0],
      bbox: [-73, 43, -72, 45],
    };

    const output = stripInternal(input) as Record<string, unknown>;

    for (const forbidden of INTERNAL_FIELDS) {
      expect(output).not.toHaveProperty(forbidden);
    }

    // Public fields survive.
    expect(output.id).toBe("util_abc");
    expect(output.name).toBe("Green Mountain Power");
    expect(output.slug).toBe("green-mountain-power");
  });

  it("strips from every item in an array", () => {
    const input = [
      { id: "a", name: "A", submittedBy: "u1" },
      { id: "b", name: "B", reviewedAt: "2026-01-01T00:00:00Z" },
    ];

    const output = stripInternal(input) as Array<Record<string, unknown>>;

    expect(output).toHaveLength(2);
    expect(output[0]).not.toHaveProperty("submittedBy");
    expect(output[1]).not.toHaveProperty("reviewedAt");
    expect(output[0]?.id).toBe("a");
    expect(output[1]?.id).toBe("b");
  });

  it("recurses into nested objects (e.g. include=iso,rto,ba)", () => {
    const input = {
      id: "util_abc",
      name: "Utility",
      _iso: {
        id: "iso_pjm",
        name: "PJM",
        // Internal field that must be stripped from the nested object.
        submittedBy: "someone",
      },
    };

    const output = stripInternal(input) as {
      _iso: Record<string, unknown>;
      [k: string]: unknown;
    };

    expect(output._iso).not.toHaveProperty("submittedBy");
    expect(output._iso.name).toBe("PJM");
  });

  it("recurses into grouped response objects (e.g. /search payload)", () => {
    const input = {
      utilities: [{ id: "u1", name: "U1", searchVector: "…" }],
      isos: [{ id: "i1", name: "I1", reviewedAt: "2026-01-01T00:00:00Z" }],
      programs: [],
    };

    const output = stripInternal(input) as Record<string, Array<Record<string, unknown>>>;

    expect(output.utilities?.[0]).not.toHaveProperty("searchVector");
    expect(output.isos?.[0]).not.toHaveProperty("reviewedAt");
    expect(output.programs).toEqual([]);
  });

  it("returns primitives unchanged", () => {
    expect(stripInternal("hello")).toBe("hello");
    expect(stripInternal(42)).toBe(42);
    expect(stripInternal(null)).toBeNull();
    expect(stripInternal(undefined)).toBeUndefined();
  });

  it("does not recurse into non-plain objects (Date, Buffer, etc.)", () => {
    const date = new Date("2026-01-01");
    const buf = Buffer.from("abc");
    const input = {
      createdAt: date,
      payload: buf,
    };
    const output = stripInternal(input) as Record<string, unknown>;
    expect(output.createdAt).toBe(date);
    expect(output.payload).toBe(buf);
  });

  it("does not mutate the original input", () => {
    const input = {
      id: "x",
      submittedBy: "u",
      nested: { searchVector: "v" },
    };
    const copy = JSON.parse(JSON.stringify(input));
    stripInternal(input);
    expect(input).toEqual(copy);
  });
});

describe("publicJsonResponse", () => {
  it("wraps data in { data: … } with internal fields stripped", async () => {
    const res = publicJsonResponse({
      id: "util_abc",
      name: "U",
      submittedBy: "u1",
      searchVector: "v",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ id: "util_abc", name: "U" });
  });

  it("accepts custom status + headers", async () => {
    const res = publicJsonResponse({ id: "x" }, 201, { "X-Custom": "yes" });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Custom")).toBe("yes");
  });
});

describe("publicPaginatedResponse", () => {
  it("strips internal fields from every item and preserves meta", async () => {
    const res = publicPaginatedResponse(
      [
        { id: "a", submittedBy: "u1", name: "A" },
        { id: "b", reviewedAt: "2026-01-01T00:00:00Z", name: "B" },
      ],
      { total: 2, cursor: null, limit: 50, hasMore: false }
    );

    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    };

    expect(body.data[0]).toEqual({ id: "a", name: "A" });
    expect(body.data[1]).toEqual({ id: "b", name: "B" });
    expect(body.meta).toEqual({ total: 2, cursor: null, limit: 50, hasMore: false });
  });
});

// ---------------------------------------------------------------------------
// Sparse fieldsets (ALL-733)
//
// Origin: Morgan's Relay bug report (2026-05-06), bug #2.
// The list endpoint was dropping numeric fields and `?fields=` was ignored,
// forcing list-then-detail access patterns (~3,150 API calls for a full
// sync). These tests guard the fix.
// ---------------------------------------------------------------------------

describe("parseFieldsParam", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(parseFieldsParam(null)).toBeNull();
    expect(parseFieldsParam(undefined)).toBeNull();
    expect(parseFieldsParam("")).toBeNull();
    expect(parseFieldsParam("   ")).toBeNull();
    expect(parseFieldsParam(",,, ,")).toBeNull();
  });

  it("splits on comma, trims whitespace, drops empties", () => {
    expect(parseFieldsParam("id, slug ,name")).toEqual(["id", "slug", "name"]);
    expect(parseFieldsParam("a,,b")).toEqual(["a", "b"]);
  });

  it("de-dupes while preserving the first-seen order", () => {
    expect(parseFieldsParam("id,slug,id,name,slug")).toEqual(["id", "slug", "name"]);
  });
});

describe("selectFields", () => {
  it("returns only the requested keys that exist on the object", () => {
    const input = {
      id: "util_abc",
      slug: "green-mountain-power",
      name: "Green Mountain Power",
      customerCount: 267602,
      totalMeterCount: 288142,
    };
    expect(selectFields(input, ["id", "slug", "customerCount"])).toEqual({
      id: "util_abc",
      slug: "green-mountain-power",
      customerCount: 267602,
    });
  });

  it("silently drops unknown field names", () => {
    const input = { id: "x", name: "X" };
    expect(selectFields(input, ["id", "nope"])).toEqual({ id: "x" });
  });

  it("preserves null and zero values (does not confuse them with missing keys)", () => {
    const input = { id: "x", customerCount: null, totalMeterCount: 0 };
    expect(selectFields(input, ["customerCount", "totalMeterCount"])).toEqual({
      customerCount: null,
      totalMeterCount: 0,
    });
  });

  it("returns non-object inputs unchanged", () => {
    expect(selectFields(null, ["id"])).toBeNull();
    expect(selectFields(undefined, ["id"])).toBeUndefined();
    expect(selectFields("hi", ["id"])).toBe("hi");
    expect(selectFields(42, ["id"])).toBe(42);
  });
});

describe("publicJsonResponse with sparse fieldsets", () => {
  it("applies ?fields= projection and still strips internal fields", async () => {
    const res = publicJsonResponse(
      {
        id: "util_abc",
        slug: "green-mountain-power",
        name: "Green Mountain Power",
        customerCount: 267602,
        totalMeterCount: 288142,
        submittedBy: "u1",
        searchVector: "'green':1",
      },
      200,
      {},
      { fields: "id,slug,name,customerCount,totalMeterCount" }
    );

    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({
      id: "util_abc",
      slug: "green-mountain-power",
      name: "Green Mountain Power",
      customerCount: 267602,
      totalMeterCount: 288142,
    });
  });

  it("refuses to resurrect internal fields via ?fields= (e.g. searchVector)", async () => {
    const res = publicJsonResponse(
      { id: "x", name: "X", searchVector: "'x':1", submittedBy: "u1" },
      200,
      {},
      { fields: "id,searchVector,submittedBy" }
    );
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ id: "x" });
  });

  it("returns the full public shape when ?fields= is omitted", async () => {
    const res = publicJsonResponse({
      id: "x",
      name: "X",
      customerCount: 100,
      submittedBy: "u1",
    });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ id: "x", name: "X", customerCount: 100 });
  });

  it("accepts pre-parsed string[] fields", async () => {
    const res = publicJsonResponse({ id: "x", name: "X", extra: "e" }, 200, {}, { fields: ["id", "name"] });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ id: "x", name: "X" });
  });
});

describe("publicPaginatedResponse with sparse fieldsets", () => {
  it("applies ?fields= projection to every item", async () => {
    const res = publicPaginatedResponse(
      [
        { id: "a", name: "A", customerCount: 100, submittedBy: "u1" },
        { id: "b", name: "B", customerCount: 200, submittedBy: "u2" },
      ],
      { total: 2, cursor: null, limit: 50, hasMore: false },
      200,
      {},
      { fields: "id,customerCount" }
    );

    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data).toEqual([
      { id: "a", customerCount: 100 },
      { id: "b", customerCount: 200 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// List/detail shape parity guard (ALL-733)
//
// The core bug: list-endpoint rows had a narrower shape than detail-endpoint
// rows, forcing clients into a 1+N access pattern. These tests are route-less
// but guard the invariant that `stripInternal` + `selectFields` produce the
// same shape for the same input, regardless of which envelope wraps it.
// ---------------------------------------------------------------------------

describe("list/detail shape parity", () => {
  const row = {
    id: "2da5b7fc-9f3d-8198-9c0e-d09ded80b4ad",
    slug: "green-mountain-power",
    name: "Green Mountain Power",
    segment: "DISTRIBUTION",
    customerCount: 267602,
    totalMeterCount: 288142,
    amiMeterCount: 279560,
    peakDemandMw: 612.3,
    // Internal fields that must be stripped from both.
    submittedBy: "u1",
    reviewedAt: "2026-01-01T00:00:00Z",
    searchVector: "'green':1 'mountain':2 'power':3",
    notionPageId: "2da5b7fc-9f3d-8198-9c0e-d09ded80b4ad",
  };

  it("publicJsonResponse(row) and publicPaginatedResponse([row]) produce the same per-record shape", async () => {
    const detailRes = publicJsonResponse(row);
    const listRes = publicPaginatedResponse([row], { total: 1, cursor: null, limit: 50, hasMore: false });

    const detailBody = (await detailRes.json()) as { data: Record<string, unknown> };
    const listBody = (await listRes.json()) as { data: Array<Record<string, unknown>> };

    expect(listBody.data).toHaveLength(1);
    const listRecord = listBody.data[0];
    if (!listRecord) throw new Error("expected at least one list record");
    expect(Object.keys(detailBody.data).sort()).toEqual(Object.keys(listRecord).sort());
    expect(listRecord).toEqual(detailBody.data);
  });

  it("numeric fields (customerCount, totalMeterCount, amiMeterCount) survive both envelopes", async () => {
    const detailRes = publicJsonResponse(row);
    const listRes = publicPaginatedResponse([row], { total: 1, cursor: null, limit: 50, hasMore: false });
    const detailBody = (await detailRes.json()) as { data: Record<string, unknown> };
    const listBody = (await listRes.json()) as { data: Array<Record<string, unknown>> };

    for (const field of ["customerCount", "totalMeterCount", "amiMeterCount", "peakDemandMw"]) {
      expect(detailBody.data[field]).toBe((row as Record<string, unknown>)[field]);
      expect(listBody.data[0]?.[field]).toBe((row as Record<string, unknown>)[field]);
    }
  });

  it("?fields= yields identical projections on both envelopes", async () => {
    const opts = { fields: "id,slug,name,customerCount" };
    const detailRes = publicJsonResponse(row, 200, {}, opts);
    const listRes = publicPaginatedResponse(
      [row],
      { total: 1, cursor: null, limit: 50, hasMore: false },
      200,
      {},
      opts
    );
    const detailBody = (await detailRes.json()) as { data: Record<string, unknown> };
    const listBody = (await listRes.json()) as { data: Array<Record<string, unknown>> };

    expect(detailBody.data).toEqual({
      id: row.id,
      slug: row.slug,
      name: row.name,
      customerCount: row.customerCount,
    });
    expect(listBody.data[0]).toEqual(detailBody.data);
  });
});
