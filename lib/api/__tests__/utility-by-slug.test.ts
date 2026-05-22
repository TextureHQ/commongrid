/**
 * Tests for GET /api/v1/utilities/[slug]
 *
 * The route's primary contract is "return the row at this slug". On
 * 2026-05-09 we extended it to transparently follow `successor_id` when a
 * row has `status='MERGED'` (or 'ACQUIRED'), so legacy slugs continue to
 * resolve at their stable URL but consumers receive the live canonical
 * record. These tests lock in:
 *
 *   1. Active (non-deprecated) row returns verbatim, no `_redirected_from`.
 *   2. MERGED row with `successor_id` returns the SUCCESSOR's data, plus a
 *      `_redirected_from` audit object describing the deprecated slug.
 *   3. Successor-following emits `Link: <…>; rel="canonical"` header.
 *   4. ACQUIRED status follows successor_id the same way as MERGED.
 *   5. `?follow_successor=false` returns the deprecated stub verbatim.
 *   6. Multi-hop chains stop at the first non-deprecated row (or after
 *      MAX_HOPS=5, whichever comes first).
 *   7. Deprecated row with NULL `successor_id` returns the row itself
 *      (no redirect to follow).
 *   8. Unknown slug → 404.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { execute: vi.fn() } as unknown,
  getDb: vi.fn(),
}));

import { GET } from "@/app/api/v1/utilities/[slug]/route";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "burt-county-public-power-district",
  name: "Burt County Public Power District",
  status: "ACTIVE",
  successorId: null,
  eiaId: "2599",
  jurisdiction: "NE",
  segment: "DISTRIBUTION_COOPERATIVE",
  isoId: null,
  rtoId: null,
  balancingAuthorityId: null,
  deprecationReason: null,
};

const MERGED_STUB = {
  id: "00000000-0000-0000-0000-000000000002",
  slug: "burt-county-ppd",
  name: "Burt County PPD",
  status: "MERGED",
  successorId: ACTIVE_ROW.id,
  eiaId: null,
  jurisdiction: "NE",
  segment: "DISTRIBUTION_COOPERATIVE",
  isoId: null,
  rtoId: null,
  balancingAuthorityId: null,
  deprecationReason: "Consolidated with EIA-sourced canonical record",
};

const ACQUIRED_STUB = {
  ...MERGED_STUB,
  id: "00000000-0000-0000-0000-000000000003",
  slug: "old-acquired-utility",
  name: "Old Acquired Utility",
  status: "ACQUIRED",
};

const DEPRECATED_NO_SUCCESSOR = {
  ...MERGED_STUB,
  id: "00000000-0000-0000-0000-000000000004",
  slug: "lonely-merged-utility",
  successorId: null,
};

// Multi-hop chain: hop1 → hop2 → hop3 (active)
const HOP1 = { ...MERGED_STUB, id: "h1", slug: "hop-1", successorId: "h2", deprecationReason: "first hop" };
const HOP2 = { ...MERGED_STUB, id: "h2", slug: "hop-2", successorId: "h3", deprecationReason: "second hop" };
const HOP3 = { ...ACTIVE_ROW, id: "h3", slug: "hop-final" };

// ---------------------------------------------------------------------------
// DB mock helper — the route does sequential `db.select().from().where().limit()`
// calls. We feed each call the row it should resolve to.
// ---------------------------------------------------------------------------

function setupDb(responses: Array<unknown[] | null>) {
  let call = 0;
  const limit = vi.fn(() => Promise.resolve(responses[call++] ?? []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  vi.mocked(getDb).mockReturnValue({ select } as unknown as ReturnType<typeof getDb>);
  return { select };
}

function makeReq(slug: string, query = "") {
  return new Request(`https://commongrid.info/api/v1/utilities/${slug}${query}`);
}

function asPromise<T>(value: T) {
  return Promise.resolve(value);
}

// ---------------------------------------------------------------------------

describe("GET /api/v1/utilities/[slug]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ACTIVE row verbatim with no redirect metadata", async () => {
    setupDb([[ACTIVE_ROW]]);

    const res = await GET(makeReq("burt-county-public-power-district") as never, {
      params: asPromise({ slug: "burt-county-public-power-district" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("burt-county-public-power-district");
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.eiaId).toBe("2599");
    expect(body.data._redirected_from).toBeUndefined();
    expect(res.headers.get("Link")).toBeNull();
  });

  it("MERGED row with successor_id follows successor and adds _redirected_from", async () => {
    // First select: lookup by slug → MERGED stub
    // Second select: lookup successor by id → ACTIVE row
    setupDb([[MERGED_STUB], [ACTIVE_ROW]]);

    const res = await GET(makeReq("burt-county-ppd") as never, {
      params: asPromise({ slug: "burt-county-ppd" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Body should be the SUCCESSOR row (canonical EIA-backed record).
    expect(body.data.slug).toBe("burt-county-public-power-district");
    expect(body.data.eiaId).toBe("2599");
    expect(body.data.status).toBe("ACTIVE");

    // Audit metadata describes the redirect.
    expect(body.data._redirected_from).toEqual({
      from_slug: "burt-county-ppd",
      from_status: "MERGED",
      reason: "Consolidated with EIA-sourced canonical record",
    });

    // Canonical link header.
    expect(res.headers.get("Link")).toBe('</api/v1/utilities/burt-county-public-power-district>; rel="canonical"');
  });

  it("ACQUIRED status follows successor the same as MERGED", async () => {
    setupDb([[ACQUIRED_STUB], [ACTIVE_ROW]]);

    const res = await GET(makeReq("old-acquired-utility") as never, {
      params: asPromise({ slug: "old-acquired-utility" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe(ACTIVE_ROW.slug);
    expect(body.data._redirected_from?.from_status).toBe("ACQUIRED");
  });

  it("?follow_successor=false returns the deprecated stub verbatim", async () => {
    setupDb([[MERGED_STUB]]);

    const res = await GET(makeReq("burt-county-ppd", "?follow_successor=false") as never, {
      params: asPromise({ slug: "burt-county-ppd" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("burt-county-ppd");
    expect(body.data.status).toBe("MERGED");
    expect(body.data.eiaId).toBeNull();
    expect(body.data._redirected_from).toBeUndefined();
    expect(res.headers.get("Link")).toBeNull();
  });

  it("multi-hop successor chain resolves to the final active row", async () => {
    setupDb([[HOP1], [HOP2], [HOP3]]);

    const res = await GET(makeReq("hop-1") as never, {
      params: asPromise({ slug: "hop-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("hop-final");
    expect(body.data._redirected_from).toEqual({
      from_slug: "hop-1",
      from_status: "MERGED",
      reason: "first hop",
    });
  });

  it("deprecated row with NULL successor_id returns the row itself (no redirect possible)", async () => {
    setupDb([[DEPRECATED_NO_SUCCESSOR]]);

    const res = await GET(makeReq("lonely-merged-utility") as never, {
      params: asPromise({ slug: "lonely-merged-utility" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe("lonely-merged-utility");
    expect(body.data.status).toBe("MERGED");
    expect(body.data._redirected_from).toBeUndefined();
    expect(res.headers.get("Link")).toBeNull();
  });

  it("unknown slug returns 404", async () => {
    setupDb([[]]);

    const res = await GET(makeReq("does-not-exist") as never, {
      params: asPromise({ slug: "does-not-exist" }),
    });

    expect(res.status).toBe(404);
  });
});
