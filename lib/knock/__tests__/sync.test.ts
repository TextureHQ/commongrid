import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  isKnockConfigured: vi.fn(),
  getKnockClient: vi.fn(),
}));

import { getKnockClient, isKnockConfigured } from "../client";
import { deleteKnockUser, deliveryToKnockChannelTypes, identifyKnockUser } from "../sync";

const mockUsersUpdate = vi.fn();
const mockUsersDelete = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getKnockClient).mockReturnValue({
    users: {
      update: mockUsersUpdate,
      delete: mockUsersDelete,
    },
  } as ReturnType<typeof getKnockClient>);
});

// ---------------------------------------------------------------------------
// deliveryToKnockChannelTypes
// ---------------------------------------------------------------------------

describe("deliveryToKnockChannelTypes", () => {
  it("returns ['email'] for email_immediate", () => {
    expect(deliveryToKnockChannelTypes("email_immediate")).toEqual(["email"]);
  });

  it("returns ['email'] for email_daily", () => {
    expect(deliveryToKnockChannelTypes("email_daily")).toEqual(["email"]);
  });

  it("returns [] for off", () => {
    expect(deliveryToKnockChannelTypes("off")).toEqual([]);
  });

  it("returns [] for in_app", () => {
    expect(deliveryToKnockChannelTypes("in_app")).toEqual([]);
  });

  it("returns [] for any unrecognised value", () => {
    expect(deliveryToKnockChannelTypes("sms_immediate")).toEqual([]);
    expect(deliveryToKnockChannelTypes("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// identifyKnockUser
// ---------------------------------------------------------------------------

describe("identifyKnockUser", () => {
  it("skips when Knock is not configured", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(false);

    await identifyKnockUser({
      id: "user-1",
      email: "test@example.com",
      displayName: "Test User",
      role: "member",
      approvedCount: 0,
    } as Parameters<typeof identifyKnockUser>[0]);

    expect(getKnockClient).not.toHaveBeenCalled();
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it("calls knock.users.update when Knock is configured", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockUsersUpdate.mockResolvedValue({});

    await identifyKnockUser({
      id: "user-2",
      email: "alice@example.com",
      displayName: "Alice",
      role: "moderator",
      approvedCount: 10,
    } as Parameters<typeof identifyKnockUser>[0]);

    expect(mockUsersUpdate).toHaveBeenCalledWith(
      "user-2",
      expect.objectContaining({
        email: "alice@example.com",
        name: "Alice",
        custom: expect.objectContaining({ isModerator: true }),
      })
    );
  });

  it("swallows errors from the Knock API", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockUsersUpdate.mockRejectedValue(new Error("Knock down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      identifyKnockUser({
        id: "user-3",
        email: null,
        displayName: "Bob",
        role: "member",
        approvedCount: 0,
      } as Parameters<typeof identifyKnockUser>[0])
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// deleteKnockUser
// ---------------------------------------------------------------------------

describe("deleteKnockUser", () => {
  it("skips when Knock is not configured", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(false);

    await deleteKnockUser("user-1");

    expect(getKnockClient).not.toHaveBeenCalled();
    expect(mockUsersDelete).not.toHaveBeenCalled();
  });

  it("calls knock.users.delete when Knock is configured", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockUsersDelete.mockResolvedValue({});

    await deleteKnockUser("user-42");

    expect(mockUsersDelete).toHaveBeenCalledWith("user-42");
  });

  it("swallows errors from the Knock API", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockUsersDelete.mockRejectedValue(new Error("Knock down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteKnockUser("user-99")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
