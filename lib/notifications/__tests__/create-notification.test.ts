import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock variables so they're available inside vi.mock() factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateWhere = vi.fn();
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  return {
    mockReturning,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    isKnockConfigured: vi.fn().mockReturnValue(false),
    triggerContributionApproved: vi.fn().mockResolvedValue(null),
    triggerContributionReturned: vi.fn().mockResolvedValue(null),
    triggerChangesRequested: vi.fn().mockResolvedValue(null),
    triggerEntityUpdated: vi.fn().mockResolvedValue(null),
    triggerDiscussionActivity: vi.fn().mockResolvedValue(null),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn().mockReturnValue({
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  }),
}));

vi.mock("@/lib/knock/client", () => ({
  isKnockConfigured: mocks.isKnockConfigured,
}));

vi.mock("@/lib/knock/workflows", () => ({
  triggerContributionApproved: mocks.triggerContributionApproved,
  triggerContributionReturned: mocks.triggerContributionReturned,
  triggerChangesRequested: mocks.triggerChangesRequested,
  triggerEntityUpdated: mocks.triggerEntityUpdated,
  triggerDiscussionActivity: mocks.triggerDiscussionActivity,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are wired)
// ---------------------------------------------------------------------------

import { createNotification } from "../create-notification";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockNotificationRow = {
  id: "notif-uuid-1",
  userId: "user-1",
  type: "contribution_approved",
  refType: "contribution",
  refId: "contrib-1",
  title: "Your contribution was approved",
  body: null,
  url: "/contributions/contrib-1",
  data: null,
  emailStatus: "pending",
  deliveryAttempts: 0,
  knockWorkflowRunId: null,
  knockMessageId: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset DB mock chains
  mocks.mockReturning.mockResolvedValue([mockNotificationRow]);
  mocks.mockInsertValues.mockReturnValue({ returning: mocks.mockReturning });
  mocks.mockInsert.mockReturnValue({ values: mocks.mockInsertValues });
  mocks.mockUpdateWhere.mockResolvedValue([]);
  mocks.mockUpdateSet.mockReturnValue({ where: mocks.mockUpdateWhere });
  mocks.mockUpdate.mockReturnValue({ set: mocks.mockUpdateSet });
  // Default Knock config: not configured
  mocks.isKnockConfigured.mockReturnValue(false);
  mocks.triggerContributionApproved.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createNotification", () => {
  it("inserts a notification row and returns it", async () => {
    const result = await createNotification({
      userId: "user-1",
      type: "contribution_approved",
      refType: "contribution",
      refId: "contrib-1",
      title: "Your contribution was approved",
    });

    expect(mocks.mockInsert).toHaveBeenCalledOnce();
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "contribution_approved",
        refType: "contribution",
        refId: "contrib-1",
        title: "Your contribution was approved",
      })
    );
    expect(result).toMatchObject({ id: "notif-uuid-1", userId: "user-1" });
  });

  it("handles Knock not being configured gracefully — no workflow triggered", async () => {
    mocks.isKnockConfigured.mockReturnValue(false);

    const result = await createNotification({
      userId: "user-1",
      type: "contribution_approved",
      refType: "contribution",
      refId: "contrib-1",
      title: "Approved",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toBeDefined();
    expect(mocks.triggerContributionApproved).not.toHaveBeenCalled();
  });

  it("triggers Knock workflow for contribution_approved type when configured", async () => {
    mocks.isKnockConfigured.mockReturnValue(true);
    mocks.triggerContributionApproved.mockResolvedValue("run-id-abc");

    await createNotification({
      userId: "user-1",
      type: "contribution_approved",
      refType: "contribution",
      refId: "contrib-1",
      title: "Approved",
      url: "/contributions/contrib-1",
      data: {
        entity_type: "utility",
        entity_slug: "pge",
        entity_url: "/utilities/pge",
        contribution_id: "contrib-1",
        moderator_comment: "Great edit!",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.triggerContributionApproved).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        contributionId: "contrib-1",
        entityType: "utility",
        entitySlug: "pge",
        entityUrl: "/utilities/pge",
        moderatorComment: "Great edit!",
      })
    );
  });

  it("stores knockWorkflowRunId on the notification after triggering", async () => {
    mocks.isKnockConfigured.mockReturnValue(true);
    mocks.triggerContributionApproved.mockResolvedValue("run-id-xyz");

    await createNotification({
      userId: "user-1",
      type: "contribution_approved",
      refType: "contribution",
      refId: "contrib-1",
      title: "Approved",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.mockUpdate).toHaveBeenCalled();
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith({ knockWorkflowRunId: "run-id-xyz" });
  });

  it("does not update knockWorkflowRunId when workflow returns null", async () => {
    mocks.isKnockConfigured.mockReturnValue(true);
    mocks.triggerContributionApproved.mockResolvedValue(null);

    await createNotification({
      userId: "user-1",
      type: "contribution_approved",
      refType: "contribution",
      refId: "contrib-1",
      title: "Approved",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });
});
