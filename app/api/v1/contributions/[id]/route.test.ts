import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockRequireCurrentUser = vi.hoisted(() => vi.fn());
const contributionsTable = vi.hoisted(() => ({ __table: "contributions" }));
const communityEditableFieldsTable = vi.hoisted(() => ({ __table: "community_editable_fields" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
    update: mockUpdate,
  }),
}));

vi.mock("@/lib/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    ...actual,
    contributions: contributionsTable,
    communityEditableFields: communityEditableFieldsTable,
  };
});

import * as route from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/contributions/contrib-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext() {
  return { requestId: "req-1", params: { id: "contrib-1" } };
}

describe("PATCH /api/v1/contributions/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
    });

    const editableFields = [
      {
        fieldName: "status",
        fieldType: "enum",
        validationRules: { enum: ["DRAFT", "ACTIVE", "PAUSED"], multiple: true },
      },
    ];

    mockSelect.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === contributionsTable) {
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "contrib-1",
                    userId: "user-1",
                    entityType: "program",
                    status: "pending",
                    changes: { status: { old: ["DRAFT"], new: ["DRAFT"] } },
                  },
                ]),
            };
          }

          return Promise.resolve(editableFields);
        },
      }),
    }));

    mockUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: "contrib-1", status: "pending" }]),
        }),
      }),
    });
  });

  it("rejects invalid enum-array members before saving", async () => {
    const response = await route.PATCH(
      makeRequest({
        changes: {
          status: { old: ["DRAFT"], new: ["DRAFT", "INVALID"] },
        },
      }),
      makeContext()
    );

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts valid enum-array members", async () => {
    const response = await route.PATCH(
      makeRequest({
        changes: {
          status: { old: ["DRAFT"], new: ["DRAFT", "ACTIVE"] },
        },
      }),
      makeContext()
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
