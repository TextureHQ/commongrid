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
import { publicJsonResponse, publicPaginatedResponse, stripInternal } from "../public-response";

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
