import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reviewRoute from "./route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  }),
}));

vi.mock("@/lib/db/client-pooled", () => ({
  getPooledDb: () => ({
    transaction: mockTransaction,
  }),
}));

vi.mock("@/lib/mod/apply-contribution", () => ({
  applyContribution: vi.fn(),
  isKnownEntityType: (entityType: string) => entityType === "program",
  markContributionApplied: vi.fn(),
}));

vi.mock("@/lib/mod/detect-change-type", () => ({
  detectChangeType: () => "update",
}));

vi.mock("@/lib/notifications/create-notification", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/notifications/notify-followers", () => ({
  notifyEntityFollowers: vi.fn(() => Promise.resolve()),
}));

import { requireCurrentUser } from "@/lib/auth";
import { applyContribution, markContributionApplied } from "@/lib/mod/apply-contribution";

const mockContribution = (overrides: Record<string, unknown> = {}) => ({
  id: "contrib-1",
  userId: "user-1",
  entityType: "program",
  entityId: "program-1",
  entitySlug: "test-program",
  entityVersion: 1,
  changes: { name: { old: "Old", new: "New" } },
  editSummary: "Update program name",
  status: "pending",
  sourceType: "government_db",
  sourceUrl: null,
  sourceDate: null,
  autoFlagged: false,
  flagReasons: null,
  autoApproved: false,
  reviewedBy: null,
  reviewedAt: null,
  moderatorComment: null,
  appliedVersion: null,
  changeType: "update",
  geometryChangeType: null,
  geometryBefore: null,
  geometryAfter: null,
  geometryValidation: null,
  changesetId: null,
  entityState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/mod/contributions/contrib-1/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext() {
  return { requestId: "req-1", params: { id: "contrib-1" } };
}

describe("POST /api/v1/mod/contributions/:id/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "moderator-1",
      role: "moderator",
    });

    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([mockContribution()]),
        }),
      }),
    });

    mockUpdate.mockReturnValue({
      set: () => ({
        where: () => Promise.resolve([mockContribution({ status: "approved" })]),
      }),
    });

    mockInsert.mockReturnValue({
      values: () => Promise.resolve(undefined),
    });

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: mockSelect,
        update: mockUpdate,
        insert: mockInsert,
        execute: () => Promise.resolve({ rows: [] }),
      };
      return callback(tx);
    });

    (applyContribution as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "applied",
      appliedVersion: 2,
      changeType: "update",
    });

    (markContributionApplied as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe("self-approval detection", () => {
    it("does not block when the moderator approves their own contribution", async () => {
      (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        role: "moderator",
      });

      const capturedValues: { metadata?: Record<string, unknown>; targetType?: string }[] = [];
      mockInsert.mockReturnValue({
        values: (v: { metadata?: Record<string, unknown>; targetType?: string }) => {
          capturedValues.push(v);
          return Promise.resolve(undefined);
        },
      });

      const res = await reviewRoute.POST(makeRequest({ action: "approve" }), makeContext());
      expect(res.status).toBe(200);

      const actionRecord = capturedValues.find((v) => v.targetType === "contribution");
      expect(actionRecord).toBeDefined();
      expect(actionRecord?.metadata).toMatchObject({ self_approved: true });
    });

    it("does not mark self_approved when the reviewer is a different user", async () => {
      const capturedValues: { metadata?: Record<string, unknown>; targetType?: string }[] = [];
      mockInsert.mockReturnValue({
        values: (v: { metadata?: Record<string, unknown>; targetType?: string }) => {
          capturedValues.push(v);
          return Promise.resolve(undefined);
        },
      });

      const res = await reviewRoute.POST(makeRequest({ action: "approve" }), makeContext());
      expect(res.status).toBe(200);

      const actionRecord = capturedValues.find((v) => v.targetType === "contribution");
      expect(actionRecord?.metadata).not.toHaveProperty("self_approved");
    });

    it("does not mark self_approved for return/request_changes even when ids match", async () => {
      (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        role: "moderator",
      });

      const capturedValues: { metadata?: Record<string, unknown>; targetType?: string }[] = [];
      mockInsert.mockReturnValue({
        values: (v: { metadata?: Record<string, unknown>; targetType?: string }) => {
          capturedValues.push(v);
          return Promise.resolve(undefined);
        },
      });

      const res = await reviewRoute.POST(makeRequest({ action: "return", comment: "Needs work" }), makeContext());
      expect(res.status).toBe(200);

      const actionRecord = capturedValues.find((v) => v.targetType === "contribution");
      expect(actionRecord?.metadata).not.toHaveProperty("self_approved");
    });
  });

  describe("version_conflict path", () => {
    it("does not mark self_approved when approval fails with version conflict", async () => {
      (requireCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        role: "moderator",
      });

      (applyContribution as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "version_conflict",
        entityVersion: 3,
        contributionVersion: 1,
      });

      mockUpdate.mockReturnValue({
        set: () => ({
          where: () => Promise.resolve([mockContribution({ status: "version_conflict" })]),
        }),
      });

      const capturedValues: { metadata?: Record<string, unknown>; targetType?: string }[] = [];
      mockInsert.mockReturnValue({
        values: (v: { metadata?: Record<string, unknown>; targetType?: string }) => {
          capturedValues.push(v);
          return Promise.resolve(undefined);
        },
      });

      const res = await reviewRoute.POST(makeRequest({ action: "approve" }), makeContext());
      expect(res.status).toBe(409);

      const actionRecord = capturedValues.find((v) => v.targetType === "contribution");
      expect(actionRecord?.metadata).not.toHaveProperty("self_approved");
    });
  });
});
