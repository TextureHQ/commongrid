import { beforeEach, describe, expect, it, vi } from "vitest";
import { userNotificationPrefs } from "@/lib/db/schema/user-notification-prefs";
import { users } from "@/lib/db/schema/users";

const mocks = vi.hoisted(() => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  deleteKnockUser: vi.fn(),
  flushTelemetry: vi.fn(),
  getDb: vi.fn(),
  headers: vi.fn(),
  identifyKnockUser: vi.fn(),
  reportError: vi.fn(),
  reportMessage: vi.fn(),
  triggerWelcome: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("svix", () => ({
  Webhook: vi.fn(function Webhook() {
    return { verify: mocks.verify };
  }),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/knock/sync", () => ({
  deleteKnockUser: mocks.deleteKnockUser,
  identifyKnockUser: mocks.identifyKnockUser,
}));

vi.mock("@/lib/knock/workflows", () => ({
  triggerWelcome: mocks.triggerWelcome,
}));

vi.mock("@/lib/observability", () => ({
  flushTelemetry: mocks.flushTelemetry,
  reportError: mocks.reportError,
  reportMessage: mocks.reportMessage,
}));

import { POST } from "./route";

type UserInsertBuilder = {
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
};

type PrefsInsertBuilder = {
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
};

function signedRequest(): Request {
  return new Request("https://commongrid.info/api/webhooks/clerk", {
    body: JSON.stringify({ ok: true }),
    method: "POST",
  });
}

function clerkUserCreatedEvent() {
  return {
    data: {
      email_addresses: [{ email_address: "duplicate@example.com", id: "email_1" }],
      first_name: "Dupe",
      id: "user_duplicate",
      image_url: "https://example.com/avatar.png",
      last_name: "Delivery",
      primary_email_address_id: "email_1",
      username: null,
    },
    type: "user.created",
  };
}

function userInsertBuilder(result: unknown[] | Error): UserInsertBuilder {
  const returning = vi.fn();
  if (result instanceof Error) {
    returning.mockRejectedValue(result);
  } else {
    returning.mockResolvedValue(result);
  }

  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return { onConflictDoNothing, returning, values };
}

function prefsInsertBuilder(): PrefsInsertBuilder {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return { onConflictDoNothing, values };
}

function selectUsers(result: unknown[]): ReturnType<typeof vi.fn> {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.db.select.mockReturnValue({ from });
  return limit;
}

describe("Clerk webhook user.created provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.insert.mockReset();
    mocks.db.select.mockReset();
    mocks.flushTelemetry.mockResolvedValue(undefined);
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.headers.mockResolvedValue(
      new Headers({
        "svix-id": "msg_1",
        "svix-signature": "sig_1",
        "svix-timestamp": "1700000000",
      })
    );
    mocks.verify.mockReturnValue(clerkUserCreatedEvent());
    process.env.CLERK_WEBHOOK_SECRET = "test_secret";
  });

  it("treats duplicate Clerk deliveries as idempotent and still ensures notification prefs", async () => {
    const existingUser = { id: "user_db_1" };
    const userInsert = userInsertBuilder([]);
    const prefsInsert = prefsInsertBuilder();
    mocks.db.insert.mockReturnValueOnce(userInsert).mockReturnValueOnce(prefsInsert);
    const selectLimit = selectUsers([existingUser]);

    const response = await POST(signedRequest());

    await expect(response.json()).resolves.toEqual({ received: true });
    expect(response.status).toBe(200);
    expect(userInsert.onConflictDoNothing).toHaveBeenCalledWith({ target: users.clerkUserId });
    expect(selectLimit).toHaveBeenCalledWith(1);
    expect(prefsInsert.values).toHaveBeenCalledWith({ userId: existingUser.id });
    expect(prefsInsert.onConflictDoNothing).toHaveBeenCalledWith({ target: userNotificationPrefs.userId });
    expect(mocks.triggerWelcome).not.toHaveBeenCalled();
    expect(mocks.identifyKnockUser).not.toHaveBeenCalled();
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("still reports unrelated user insert failures", async () => {
    const dbError = new Error("database unavailable");
    const userInsert = userInsertBuilder(dbError);
    mocks.db.insert.mockReturnValueOnce(userInsert);

    const response = await POST(signedRequest());

    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
    expect(response.status).toBe(500);
    expect(userInsert.onConflictDoNothing).toHaveBeenCalledWith({ target: users.clerkUserId });
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(dbError, {
      extra: { eventType: "user.created" },
      scope: "webhook.clerk",
    });
    expect(mocks.flushTelemetry).toHaveBeenCalled();
  });
});
