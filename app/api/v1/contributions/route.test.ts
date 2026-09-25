import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
  }),
}));

// The programs table stands in for "a table that has a slug column". Everything
// else in the module is kept real via importOriginal so shared constants like
// EDIT_SUMMARY_MIN_LENGTH stay in sync with the source instead of drifting.
vi.mock("@/lib/mod/apply-contribution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mod/apply-contribution")>();
  return {
    ...actual,
    getEntityTable: () => ({ id: { name: "id" }, slug: { name: "slug" } }),
  };
});

vi.mock("@/lib/mod/auto-approve", () => ({
  tryAutoApprove: vi.fn(async () => ({ autoApproved: false })),
}));

vi.mock("@/lib/knock/client", () => ({
  isKnockConfigured: () => false,
}));

vi.mock("@/lib/knock/workflows", () => ({
  triggerContributionSubmitted: vi.fn(),
  triggerModNewContribution: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth";
import { POST } from "./route";

const PROGRAM_ROW = {
  id: "8357db3c-a1f3-4b6a-b706-0e7fe46c81fa",
  slug: "flexible-load-bring-your-own-battery",
  name: "Flexible Load - Bring Your Own Battery",
  status: "active",
  version: 3,
};

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/contributions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    entity_type: "program",
    entity_id: "flexible-load-bring-your-own-battery",
    entity_version: 3,
    edit_summary: "Requesting deletion because this is a duplicate program row.",
    source_type: "utility_website",
    source_url: "https://example.com/proof",
    change_type: "delete",
    changes: { _deletion: { reason: "duplicate" } },
    ...overrides,
  };
}

describe("POST /api/v1/contributions — entity resolution", () => {
  let insertedValues: Record<string, unknown> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    insertedValues = null;

    (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      role: "contributor",
      displayName: "Cyril",
      bannedAt: null,
    });

    // First select() = entity lookup; second = entity-lock lookup (none);
    // third = multi_enum metadata lookup (none).
    let call = 0;
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call += 1;
          if (call === 1) {
            return {
              limit: () => Promise.resolve([PROGRAM_ROW]),
            };
          }
          if (call === 2) {
            return {
              limit: () => Promise.resolve([]),
            };
          }
          return Promise.resolve([]);
        },
      }),
    }));

    mockInsert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        insertedValues = v;
        return {
          returning: () => Promise.resolve([{ id: "contrib-1", ...v, status: "pending" }]),
        };
      },
    });
  });

  it("resolves a program by slug and stores the canonical id on the contribution", async () => {
    const res = await POST(makeRequest(baseBody()) as never);
    expect(res.status).toBe(201);
    // The panel sent the slug; the stored contribution must carry the DB id so
    // the downstream apply targets the real row.
    expect(insertedValues?.entityId).toBe("8357db3c-a1f3-4b6a-b706-0e7fe46c81fa");
    expect(insertedValues?.entitySlug).toBe("flexible-load-bring-your-own-battery");
  });

  it("rejects an edit summary shorter than the shared minimum", async () => {
    const res = await POST(makeRequest(baseBody({ edit_summary: "too short" })) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toContain("25 characters");
  });
});

// Full-history summary must retain the caller's scope but ignore status/page.
describe("GET /api/v1/contributions — summary", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["pending", "approved", "returned", "withdrawn", null])(
    "keeps summary unfiltered when status=%s and page=2",
    async (status) => {
      const { PgDialect } = await import("drizzle-orm/pg-core");
      const dialect = new PgDialect();
      const countWhere = vi.fn().mockResolvedValue([{ count: 3 }]);
      const dataWhere = vi.fn().mockResolvedValue([{ id: "matching-row", status }]);
      const summaryWhere = vi.fn().mockResolvedValue([{ total: 120, pending: 30, approved: 75 }]);
      const limit = vi.fn(() => ({ offset: () => ({ where: dataWhere }) }));
      mockSelect
        .mockReturnValueOnce({ from: () => ({ where: countWhere }) })
        .mockReturnValueOnce({ from: () => ({ orderBy: () => ({ limit }) }) })
        .mockReturnValueOnce({ from: () => ({ where: summaryWhere }) });

      const { GET } = await import("./route");
      const { NextRequest } = await import("next/server");
      const params = new URLSearchParams({
        user_id: "user-1",
        entity_type: "utility",
        entity_id: "utility-1",
        include_summary: "true",
        limit: "1",
        page: "2",
      });
      if (status) params.set("status", status);
      const response = await GET(new NextRequest(`http://localhost/api/v1/contributions?${params}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.summary).toEqual({ total: 120, pending: 30, approved: 75 });
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(3);
      expect(limit).toHaveBeenCalledWith(1);
      const scope = dialect.sqlToQuery(summaryWhere.mock.calls[0][0]);
      expect(scope.params).toEqual(["utility", "utility-1", "user-1"]);
      expect(scope.sql).not.toContain('"status"');
      const listScope = dialect.sqlToQuery(countWhere.mock.calls[0][0]);
      expect(listScope.params).toEqual([...(status ? [status] : []), "utility", "utility-1", "user-1"]);
      expect(dialect.sqlToQuery(dataWhere.mock.calls[0][0])).toEqual(listScope);
      const selection = mockSelect.mock.calls[2][0];
      expect(dialect.sqlToQuery(selection.total).sql).toBe("count(*)");
      expect(dialect.sqlToQuery(selection.pending).sql).toContain("= 'pending'");
      expect(dialect.sqlToQuery(selection.approved).sql).toContain("in ('approved', 'auto_approved')");
      // PostgreSQL count values may arrive as strings.
      expect(selection.total.decoder.mapFromDriverValue("120")).toBe(120);
    }
  );

  it("does not add a summary or extra query unless requested", async () => {
    mockSelect.mockReturnValueOnce({ from: () => Promise.resolve([{ count: 0 }]) }).mockReturnValueOnce({
      from: () => ({ orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([]) }) }) }),
    });
    const { GET } = await import("./route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://localhost/api/v1/contributions"));
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("summary");
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});
