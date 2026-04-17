/**
 * Moderator role guard for moderation API routes.
 *
 * Checks that the current user has 'moderator' or 'admin' role.
 * Throws ApiError FORBIDDEN if not.
 */

import { ApiError } from "@/lib/api/errors";
import { requireCurrentUser } from "@/lib/auth";
import type { UserSelect } from "@/lib/db/schema/users";

const MOD_ROLES = new Set(["moderator", "admin"]);

/**
 * Require the current user to be a moderator or admin.
 * Returns the user if authorized; throws ApiError if not.
 */
export async function requireModerator(): Promise<UserSelect> {
  const user = await requireCurrentUser();

  if (!MOD_ROLES.has(user.role)) {
    throw new ApiError("FORBIDDEN", "This endpoint requires moderator or admin privileges.");
  }

  return user;
}

/**
 * Require the current user to be an admin.
 * Returns the user if authorized; throws ApiError if not.
 */
export async function requireAdmin(): Promise<UserSelect> {
  const user = await requireCurrentUser();

  if (user.role !== "admin") {
    throw new ApiError("FORBIDDEN", "This endpoint requires admin privileges.");
  }

  return user;
}
