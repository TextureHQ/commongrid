/**
 * Unit tests for auto-approval eligibility rules.
 *
 * These isolate checkEligibility from the transaction-heavy apply path so we
 * can pin the role/field gating matrix without a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSelect } from "@/lib/db/schema/users";
import { checkEligibility } from "@/lib/mod/auto-approve";

const selectFromWhere = vi.fn();

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => selectFromWhere(),
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    ...actual,
    communityEditableFields: {
      entityType: "entity_type",
      fieldName: "field_name",
      isCritical: "is_critical",
    },
  };
});

function user(role: UserSelect["role"]): UserSelect {
  return {
    id: "user-1",
    clerkUserId: "user_1",
    displayName: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    affiliation: null,
    bio: null,
    role,
    contributionCount: 0,
    approvedCount: 0,
    returnedCount: 0,
    entityTypesEdited: [],
    contributionStatsByType: {},
    trustedPromotedAt: null,
    trustedPromotedBy: null,
    bannedAt: null,
    bannedUntil: null,
    banReason: null,
    warningCount: 0,
    modPreferredEntityTypes: null,
    modPreferredRegions: null,
    modNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: null,
  };
}

const programFields = [
  { entityType: "program", fieldName: "name", isCritical: true },
  { entityType: "program", fieldName: "description", isCritical: false },
  { entityType: "program", fieldName: "status", isCritical: true },
  { entityType: "program", fieldName: "organizations", isCritical: false },
  { entityType: "program", fieldName: "asset_types", isCritical: true },
  { entityType: "program", fieldName: "market_segments", isCritical: false },
  { entityType: "program", fieldName: "grid_services", isCritical: true },
  { entityType: "program", fieldName: "participation_models", isCritical: false },
  { entityType: "program", fieldName: "incentive_structures", isCritical: false },
];

const fullProgramCreate = {
  name: "New Program",
  description: "A description",
  status: "active",
  organizations: [{ entityId: "utility-1", role: "ADMINISTRATOR" }],
};

describe("checkEligibility", () => {
  beforeEach(() => {
    selectFromWhere.mockReset();
    selectFromWhere.mockResolvedValue(programFields);
  });

  describe("create", () => {
    it("approves a moderator creating a program with critical fields", async () => {
      const result = await checkEligibility(user("moderator"), "program", fullProgramCreate, "create");
      expect(result).toEqual({ eligible: true });
      expect(selectFromWhere).not.toHaveBeenCalled();
    });

    it("approves an admin creating a program with critical fields", async () => {
      const result = await checkEligibility(user("admin"), "program", fullProgramCreate, "create");
      expect(result).toEqual({ eligible: true });
    });

    it("rejects a plain contributor creating a program", async () => {
      const result = await checkEligibility(user("contributor"), "program", fullProgramCreate, "create");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/moderator/i);
    });

    it("rejects a trusted contributor creating a program", async () => {
      const result = await checkEligibility(user("trusted_contributor"), "program", fullProgramCreate, "create");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/moderator/i);
    });

    it("rejects an empty create payload", async () => {
      const result = await checkEligibility(user("moderator"), "program", {}, "create");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/no fields/i);
    });
  });

  describe("update", () => {
    it("approves a trusted contributor editing only non-critical fields", async () => {
      const result = await checkEligibility(
        user("trusted_contributor"),
        "program",
        { description: "Updated" },
        "update"
      );
      expect(result).toEqual({ eligible: true });
    });

    it("rejects a trusted contributor editing a critical field", async () => {
      const result = await checkEligibility(
        user("trusted_contributor"),
        "program",
        { name: "Renamed Program" },
        "update"
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/critical/i);
    });

    it("rejects a trusted contributor editing an unknown field", async () => {
      const result = await checkEligibility(user("trusted_contributor"), "program", { unknown_field: "x" }, "update");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/not in community_editable_fields/i);
    });

    it("treats multi_enum fields as known editable fields", async () => {
      const result = await checkEligibility(
        user("trusted_contributor"),
        "program",
        { market_segments: ["RESIDENTIAL"] },
        "update"
      );
      expect(result).toEqual({ eligible: true });
    });

    it("rejects a contributor editing non-critical fields", async () => {
      const result = await checkEligibility(user("contributor"), "program", { description: "Updated" }, "update");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/trusted contributor/i);
    });

    it("rejects a moderator editing a critical field (same field gating as trusted contributor)", async () => {
      const result = await checkEligibility(user("moderator"), "program", { name: "Renamed Program" }, "update");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/critical/i);
    });

    it("rejects a moderator editing a critical multi_enum field", async () => {
      const result = await checkEligibility(user("moderator"), "program", { asset_types: ["BATTERY"] }, "update");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/critical/i);
    });

    it("rejects an empty update payload", async () => {
      const result = await checkEligibility(user("trusted_contributor"), "program", {}, "update");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/no fields/i);
    });
  });

  describe("delete", () => {
    it("approves an admin deleting an entity", async () => {
      const result = await checkEligibility(user("admin"), "program", { confirm: true }, "delete");
      expect(result).toEqual({ eligible: true });
      expect(selectFromWhere).not.toHaveBeenCalled();
    });

    it("rejects a moderator deleting an entity", async () => {
      const result = await checkEligibility(user("moderator"), "program", { confirm: true }, "delete");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/admin/i);
    });

    it("rejects a contributor deleting an entity", async () => {
      const result = await checkEligibility(user("contributor"), "program", { confirm: true }, "delete");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/admin/i);
    });

    it("rejects an empty delete payload", async () => {
      const result = await checkEligibility(user("admin"), "program", {}, "delete");
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/no fields/i);
    });
  });
});
