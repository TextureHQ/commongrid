/**
 * Knock User Sync
 *
 * Keeps Knock's user store in sync with CommonGrid's users table.
 * All operations are fire-and-forget: errors are logged but never thrown,
 * so a Knock outage cannot break the primary request path.
 */

import type { UserNotificationPrefSelect } from "@/lib/db/schema/user-notification-prefs";
import type { UserSelect } from "@/lib/db/schema/users";
import { getKnockClient, isKnockConfigured } from "./client";

// ---------------------------------------------------------------------------
// Channel type mapping
// ---------------------------------------------------------------------------

/**
 * Maps CommonGrid delivery preference values to the Knock channel-type array
 * that should be enabled for that category.
 *
 * Returns an empty array when the pref is 'off' or 'in_app' (email disabled).
 */
export function deliveryToKnockChannelTypes(delivery: string): string[] {
  switch (delivery) {
    case "email_immediate":
    case "email_daily":
      return ["email"];
    case "in_app":
    case "off":
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// User identification
// ---------------------------------------------------------------------------

/**
 * Identify (create or update) a user in Knock.
 * Safe to call on every user create/update — idempotent.
 */
export async function identifyKnockUser(user: UserSelect): Promise<void> {
  if (!isKnockConfigured()) return;

  try {
    const knock = getKnockClient();
    await knock.users.update(user.id, {
      email: user.email ?? undefined,
      name: user.displayName,
      custom: {
        role: user.role,
        approvedCount: user.approvedCount,
        isModerator: user.role === "moderator" || user.role === "admin",
        emailPaused: false,
      },
    });
  } catch (err) {
    console.error("[knock] identifyKnockUser failed for user", user.id, err);
  }
}

// ---------------------------------------------------------------------------
// User deletion
// ---------------------------------------------------------------------------

/**
 * Remove a user from Knock.
 * Called on soft-delete / account removal.
 */
export async function deleteKnockUser(userId: string): Promise<void> {
  if (!isKnockConfigured()) return;

  try {
    const knock = getKnockClient();
    await knock.users.delete(userId);
  } catch (err) {
    console.error("[knock] deleteKnockUser failed for user", userId, err);
  }
}

// ---------------------------------------------------------------------------
// Preference sync
// ---------------------------------------------------------------------------

/**
 * Push CommonGrid notification preferences to Knock as channel-type preferences
 * per category.  Knock uses this to gate email sends at the workflow level.
 */
export async function syncKnockPreferences(
  userId: string,
  prefs: UserNotificationPrefSelect
): Promise<void> {
  if (!isKnockConfigured()) return;

  try {
    const knock = getKnockClient();

    const emailEnabled = !prefs.emailPaused;

    // Build per-category channel_types preference object
    const categories: Record<string, { channel_types: { email: boolean } }> = {
      contribution_status: {
        channel_types: {
          email: emailEnabled && deliveryToKnockChannelTypes(prefs.contributionStatusDelivery).includes("email"),
        },
      },
      followed_changes: {
        channel_types: {
          email: emailEnabled && deliveryToKnockChannelTypes(prefs.followedChangesDelivery).includes("email"),
        },
      },
      discussion_activity: {
        channel_types: {
          email: emailEnabled && deliveryToKnockChannelTypes(prefs.discussionActivityDelivery).includes("email"),
        },
      },
      appeal_resolved: {
        channel_types: {
          email: emailEnabled && deliveryToKnockChannelTypes(prefs.appealResolvedDelivery).includes("email"),
        },
      },
    };

    await knock.users.setPreferences(userId, "default", {
      channel_types: {
        email: emailEnabled,
      },
      categories,
    });
  } catch (err) {
    console.error("[knock] syncKnockPreferences failed for user", userId, err);
  }
}
