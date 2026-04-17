/**
 * Create a notification for a user.
 *
 * Central helper called by contribution approval, discussion post creation,
 * and entity follow update flows to insert a notification record.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

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
 * Insert a notification record.
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
  return rows;
}
