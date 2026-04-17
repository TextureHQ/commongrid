/**
 * Notify followers of an entity about a change.
 *
 * Queries entity_follows for all users following the given entity, then
 * creates notifications for those who have the relevant notification
 * preference enabled.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { entityFollows } from "@/lib/db/schema";
import { type CreateNotificationParams, createNotifications } from "./create-notification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowerNotifyReason = "entity_change" | "discussion_activity";

// ---------------------------------------------------------------------------
// Notify entity followers
// ---------------------------------------------------------------------------

/**
 * Notify all followers of a specific entity.
 *
 * @param entityType  - The entity type being followed (e.g., "utility")
 * @param entityId    - The entity ID
 * @param reason      - Why we're notifying: 'entity_change' checks notify_all_changes,
 *                      'discussion_activity' checks notify_discussions
 * @param notification - Notification payload (without userId — that comes from each follow)
 * @param excludeUserIds - User IDs to exclude (e.g., the actor who triggered the notification)
 */
export async function notifyEntityFollowers(
  entityType: string,
  entityId: string,
  reason: FollowerNotifyReason,
  notification: Omit<CreateNotificationParams, "userId">,
  excludeUserIds: string[] = []
) {
  const db = getDb();

  // Fetch followers with appropriate preference
  const conditions = [eq(entityFollows.entityType, entityType), eq(entityFollows.entityId, entityId)];

  if (reason === "entity_change") {
    conditions.push(eq(entityFollows.notifyAllChanges, true));
  } else {
    conditions.push(eq(entityFollows.notifyDiscussions, true));
  }

  const followers = await db
    .select({ userId: entityFollows.userId })
    .from(entityFollows)
    .where(and(...conditions));

  // Filter out excluded users (e.g., the actor themselves)
  const excludeSet = new Set(excludeUserIds);
  const userIds = followers.map((f) => f.userId).filter((id) => !excludeSet.has(id));

  if (userIds.length === 0) return [];

  return createNotifications(userIds, notification);
}
