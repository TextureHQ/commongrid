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

// The programs table stands in for "a table that has a slug column".
vi.mock("@/lib/mod/apply-contribution", () => ({
  getEntityTable: () => ({ id: { name: "id" }, slug: { name: "slug" } }),
}));

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
