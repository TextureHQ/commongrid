import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

// Mock Clerk so no signed-in session exists.
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  currentUser: vi.fn(),
}));

// Mock the DB so getCurrentUser resolves to "no local user".
const mockLimit = vi.fn();
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => mockLimit(...args),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema/users", () => ({
  users: { clerkUserId: "clerk_user_id" },
}));

import { requireCurrentUser } from "@/lib/auth";

describe("requireCurrentUser — unauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEV_AUTH_BYPASS;
  });

  it("throws a typed 401 ApiError (not a plain 500) when there is no session", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    // Regression guard for CIR-1549: unauthenticated calls to Clerk-session
    // routes must surface as UNAUTHORIZED (401), which withErrorHandling does
    // NOT report to Sentry — instead of a plain Error → 500 → Sentry noise.
    await expect(requireCurrentUser()).rejects.toMatchObject({
      name: "ApiError",
      code: "UNAUTHORIZED",
      status: 401,
    });

    await expect(requireCurrentUser()).rejects.toBeInstanceOf(ApiError);
    expect(mockLimit).not.toHaveBeenCalled();
  });
});
