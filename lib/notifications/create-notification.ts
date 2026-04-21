/**
 * Create a notification for a user.
 *
 * Central helper called by contribution approval, discussion post creation,
 * and entity follow update flows to insert a notification record.
 *
 * Also triggers the corresponding Knock workflow for email/push delivery.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { isKnockConfigured } from "@/lib/knock/client";
import {
  triggerContributionApproved,
  triggerContributionReturned,
  triggerChangesRequested,
  triggerEntityUpdated,
  triggerDiscussionActivity,
} from "@/lib/knock/workflows";
import type {
  ContributionNotificationData,
  EntityUpdateNotificationData,
  DiscussionNotificationData,
} from "@/lib/knock/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "contribution_approved"
  | "contribution_returned"
  | "changes_requested"
  | "entity_updated"
  | "discussion_reply"
  | "appeal_resolved"
  | "trusted_status_earned"
  | "entity_followed_update";

export type NotificationRefType = "contribution" | "entity" | "discussion" | "appeal";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  refType: NotificationRefType;
  refId: string;
  title: string;
  body?: string | null;
  url?: string | null;
  data?: Record<string, unknown> | null;
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction types are deeply generic
type DrizzleDb = PgTransaction<NeonHttpQueryResultHKT, any, ExtractTablesWithRelations<any>> | ReturnType<typeof getDb>;

// ---------------------------------------------------------------------------
// Create a single notification
// ---------------------------------------------------------------------------

/**
 * Insert a notification record and trigger Knock workflow for email delivery.
 *
 * @param params  - Notification data
 * @param db      - Optional: pass a transaction to batch with other writes.
 *                  Falls back to getDb() when omitted.
 * @returns The inserted notification row.
 */
export async function createNotification(params: CreateNotificationParams, db?: DrizzleDb) {
  const database = db ?? getDb();

  const [notification] = await database
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      refType: params.refType,
      refId: params.refId,
      title: params.title,
      body: params.body ?? null,
      url: params.url ?? null,
      data: params.data ?? null,
    })
    .returning();

  // Trigger Knock workflow (fire-and-forget)
  if (isKnockConfigured() && notification) {
    triggerKnockForNotification(params).catch((err) =>
      console.error("[knock] Failed to trigger workflow for notification", notification.id, err)
    );
  }

  return notification;
}

// ---------------------------------------------------------------------------
// Batch-create notifications for multiple users
// ---------------------------------------------------------------------------

/**
 * Create the same notification for multiple users at once.
 *
 * Deduplicates user IDs and filters out nulls/undefineds.
 */
export async function createNotifications(
  userIds: (string | null | undefined)[],
  notification: Omit<CreateNotificationParams, "userId">,
  db?: DrizzleDb
) {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return [];

  const database = db ?? getDb();

  const values = unique.map((userId) => ({
    userId,
    type: notification.type,
    refType: notification.refType,
    refId: notification.refId,
    title: notification.title,
    body: notification.body ?? null,
    url: notification.url ?? null,
    data: notification.data ?? null,
  }));

  const rows = await database.insert(notifications).values(values).returning();

  // Trigger Knock workflows for batch notifications (fire-and-forget)
  if (isKnockConfigured() && rows.length > 0) {
    triggerKnockForBatchNotification(unique, notification).catch((err) =>
      console.error("[knock] Failed to trigger batch workflow:", err)
    );
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Knock workflow trigger helpers
// ---------------------------------------------------------------------------

/**
 * Map a notification type to the corresponding Knock workflow trigger.
 */
async function triggerKnockForNotification(params: CreateNotificationParams): Promise<void> {
  const d = params.data ?? {};

  switch (params.type) {
    case "contribution_approved":
      await triggerContributionApproved(params.userId, {
        contributionId: (d.contribution_id as string) ?? params.refId,
        entityType: (d.entity_type as string) ?? "",
        entitySlug: (d.entity_slug as string) ?? "",
        entityUrl: (d.entity_url as string) ?? "",
        contributionUrl: params.url ?? `/contributions/${params.refId}`,
        moderatorComment: (d.moderator_comment as string) ?? null,
        changeSummary: params.body ?? null,
      });
      break;
    case "contribution_returned":
      await triggerContributionReturned(params.userId, {
        contributionId: (d.contribution_id as string) ?? params.refId,
        entityType: (d.entity_type as string) ?? "",
        entitySlug: (d.entity_slug as string) ?? "",
        entityUrl: (d.entity_url as string) ?? "",
        contributionUrl: params.url ?? `/contributions/${params.refId}`,
        moderatorComment: (d.moderator_comment as string) ?? null,
        changeSummary: params.body ?? null,
      });
      break;
    case "changes_requested":
      await triggerChangesRequested(params.userId, {
        contributionId: (d.contribution_id as string) ?? params.refId,
        entityType: (d.entity_type as string) ?? "",
        entitySlug: (d.entity_slug as string) ?? "",
        entityUrl: (d.entity_url as string) ?? "",
        contributionUrl: params.url ?? `/contributions/${params.refId}`,
        moderatorComment: (d.moderator_comment as string) ?? null,
        changeSummary: params.body ?? null,
      });
      break;
    default:
      // Other types don't have Knock workflows yet
      break;
  }
}

/**
 * Trigger Knock workflow for batch notifications.
 */
async function triggerKnockForBatchNotification(
  recipientIds: string[],
  notification: Omit<CreateNotificationParams, "userId">
): Promise<void> {
  const d = notification.data ?? {};

  switch (notification.type) {
    case "entity_followed_update":
    case "entity_updated":
      await triggerEntityUpdated(recipientIds, {
        entityId: (d.entity_id as string) ?? notification.refId,
        entityType: (d.entity_type as string) ?? "",
        entitySlug: (d.entity_slug as string) ?? "",
        entityUrl: notification.url ?? "",
        editSummary: notification.body ?? "",
        contributorName: (d.contributor_name as string) ?? null,
      });
      break;
    case "discussion_reply":
      await triggerDiscussionActivity(recipientIds, {
        threadId: (d.thread_id as string) ?? notification.refId,
        postId: (d.post_id as string) ?? "",
        entityType: (d.entity_type as string) ?? "",
        entitySlug: (d.entity_slug as string) ?? "",
        threadUrl: notification.url ?? "",
        postPreview: notification.body ?? "",
        authorName: (d.author_name as string) ?? "Unknown",
      });
      break;
    default:
      break;
  }
}
