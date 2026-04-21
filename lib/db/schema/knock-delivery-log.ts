import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { notifications } from "./notifications";

/**
 * Knock Delivery Log — Webhook Audit Trail
 *
 * Records every Knock delivery webhook event received. Used for debugging,
 * auditing, and idempotency checks. Linked to the notifications table when a
 * matching knockMessageId is found, but the FK is nullable so events for
 * unknown messages are still stored.
 */
export const knockDeliveryLog = pgTable(
  "knock_delivery_log",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    /** The Knock message ID from the webhook payload (data.id). */
    knockMessageId: text("knock_message_id").notNull(),

    /** Nullable FK — set when we can match the message to a notification row. */
    notificationId: text("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),

    /** The Knock webhook event type, e.g. 'message.delivered'. */
    eventType: text("event_type").notNull(),

    /** Knock channel ID (e.g., email channel UUID). */
    channel: text("channel").notNull(),

    /** Derived status string: 'sent', 'bounced', 'failed', or the raw event type. */
    status: text("status").notNull(),

    /** Full webhook data payload for debugging. */
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_knock_delivery_log_message_id").on(table.knockMessageId),
    index("idx_knock_delivery_log_notification_id").on(table.notificationId),
    index("idx_knock_delivery_log_event_created").on(table.eventType, table.createdAt),
  ]
);

export type KnockDeliveryLogSelect = typeof knockDeliveryLog.$inferSelect;
export type KnockDeliveryLogInsert = typeof knockDeliveryLog.$inferInsert;
