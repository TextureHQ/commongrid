import { beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
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
    communityEditableFields: {
      entityType: "entity_type",
      fieldName: "field_name",
      fieldType: "field_type",
      validationRules: "validation_rules",
    },
  };
});

import { requireCurrentUser } from "@/lib/auth";

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

    (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1" });

    mockSelect.mockImplementation((projection?: Record<string, unknown>) => {
      const isFieldMetaLookup = Boolean(projection);

      return {
        from: () => ({
          where: () => {
            if (isFieldMetaLookup) {
              return Promise.resolve([
                {
                  fieldName: "asset_types",
                  validationRules: { enum: ["BATTERY", "EV_CHARGER"] },
                },
              ]);
            }

            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: "contrib-1",
                    userId: "user-1",
                    entityType: "program",
                    status: "pending",
                    changes: { asset_types: { old: ["BATTERY"], new: ["BATTERY"] } },
                  },
                ]),
            };
          },
        }),
      };
    });

    mockUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it("rejects invalid enum-array members on multi_enum fields", async () => {
    const res = await route.PATCH(
      makeRequest({
        changes: { asset_types: ["BATTERY", "NOT_REAL"] },
      }),
      makeContext()
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error?.message ?? body.error ?? "")).toMatch(/invalid values/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts valid multi_enum updates", async () => {
    const res = await route.PATCH(
      makeRequest({
        changes: { asset_types: ["BATTERY", "EV_CHARGER"] },
        edit_summary: "Updated asset types for the program record",
      }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
