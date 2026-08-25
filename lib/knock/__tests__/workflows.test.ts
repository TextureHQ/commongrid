import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Knock client and observability before importing workflows
vi.mock("../client", () => ({
  isKnockConfigured: vi.fn(),
  getKnockClient: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({
  reportError: vi.fn(),
  flushTelemetry: vi.fn(),
}));

import { reportError } from "@/lib/observability";
import { getKnockClient, isKnockConfigured } from "../client";
import { triggerContributionApproved, triggerWorkflow } from "../workflows";

const mockTrigger = vi.fn();
const mockReportError = vi.mocked(reportError);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getKnockClient).mockReturnValue({
    workflows: { trigger: mockTrigger },
  } as ReturnType<typeof getKnockClient>);
});

describe("triggerWorkflow", () => {
  it("returns null when Knock is not configured", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(false);

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: ["user-1"],
      data: {},
    });

    expect(result).toBeNull();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("returns null when recipients list is empty", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: [],
      data: {},
    });

    expect(result).toBeNull();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("calls the Knock SDK and returns workflow_run_id", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockTrigger.mockResolvedValue({ workflow_run_id: "run-abc-123" });

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: ["user-1"],
      data: { foo: "bar" },
      cancellationKey: "test-key",
    });

    expect(mockTrigger).toHaveBeenCalledWith("contribution-approved", {
      recipients: ["user-1"],
      data: { foo: "bar" },
      cancellation_key: "test-key",
      actor: null,
    });
    expect(result).toBe("run-abc-123");
  });

  it("reports a missing recipient error via reportError and returns null", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    const missingRecipientError = Object.assign(new Error("404 resource_missing: recipient not found"), {
      status: 404,
      error: { code: "resource_missing", message: "recipient not found" },
    });
    mockTrigger.mockRejectedValue(missingRecipientError);

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: ["missing-user"],
      data: {},
    });

    expect(result).toBeNull();
    expect(mockReportError).toHaveBeenCalledWith(missingRecipientError, {
      scope: "knock.workflows",
      level: "warning",
      extra: expect.objectContaining({
        workflow: "contribution-approved",
        recipients: ["missing-user"],
      }),
    });
  });

  it("reports a no-email recipient error via reportError and returns null", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    const noEmailError = Object.assign(new Error("recipient has no email"), {
      status: 422,
      error: { code: "no_email", message: "recipient has no email" },
    });
    mockTrigger.mockRejectedValue(noEmailError);

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: ["no-email-user"],
      data: {},
    });

    expect(result).toBeNull();
    expect(mockReportError).toHaveBeenCalledWith(noEmailError, {
      scope: "knock.workflows",
      level: "warning",
      extra: expect.objectContaining({
        workflow: "contribution-approved",
        recipients: ["no-email-user"],
      }),
    });
  });

  it("logs a generic error and returns null for non-recipient failures", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockTrigger.mockRejectedValue(new Error("Network failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await triggerWorkflow({
      workflow: "contribution-approved",
      recipients: ["user-1"],
      data: {},
    });

    expect(result).toBeNull();
    expect(mockReportError).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("triggerWorkflow failed"), expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("triggerContributionApproved", () => {
  it("triggers the contribution-approved workflow with correct data", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockTrigger.mockResolvedValue({ workflow_run_id: "run-xyz" });

    const data = {
      contributionId: "contrib-1",
      entityType: "utility",
      entitySlug: "pge",
      entityUrl: "/utilities/pge",
      contributionUrl: "/contributions/contrib-1",
      moderatorComment: "Looks good",
    };

    const result = await triggerContributionApproved("user-1", data);

    expect(mockTrigger).toHaveBeenCalledWith(
      "contribution-approved",
      expect.objectContaining({
        recipients: ["user-1"],
        data: expect.objectContaining({
          contributionId: "contrib-1",
          entityType: "utility",
          entitySlug: "pge",
        }),
        cancellation_key: "contribution-approved:contrib-1",
      })
    );
    expect(result).toBe("run-xyz");
  });

  it("uses a custom cancellation key when provided", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockTrigger.mockResolvedValue({ workflow_run_id: "run-custom" });

    await triggerContributionApproved(
      "user-1",
      {
        contributionId: "contrib-2",
        entityType: "utility",
        entitySlug: "sce",
        entityUrl: "/utilities/sce",
        contributionUrl: "/contributions/contrib-2",
      },
      "my-custom-key"
    );

    expect(mockTrigger).toHaveBeenCalledWith(
      "contribution-approved",
      expect.objectContaining({ cancellation_key: "my-custom-key" })
    );
  });
});
