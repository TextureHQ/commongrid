import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Notifications — In-App and Email Queue
 *
 * Stores both in-app and email notifications. Phase 1 uses polling-based
 * delivery (30s poll on unread count endpoint). Phase 2 adds SSE/WebSocket
 * push via Redis PUBSUB without requiring schema changes.
 *
 * Email delivery is tracked via email_status + delivery_attempts for retry
 * logic (max 3 attempts) and bounce handling.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to users; ON DELETE CASCADE */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * 'contribution_approved' | 'contribution_returned' | 'changes_requested'
     * | 'entity_updated' | 'discussion_reply' | 'appeal_resolved'
     * | 'trusted_status_earned' | 'entity_followed_update'
     */
    type: text("type").notNull(),

    // Polymorphic reference to the triggering resource
    /** 'contribution' | 'entity' | 'discussion' | 'appeal' */
    refType: text("ref_type").notNull(),
    refId: text("ref_id").notNull(),

    // Pre-rendered display content
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),

    /**
     * Structured data for rich rendering (parameterized templates, i18n).
     * e.g., {"entity_name": "PG&E", "field": "customer_count", "old": 5400000, "new": 5450000}
     */
    data: jsonb("data"),

    // Read tracking
    readAt: timestamp("read_at", { withTimezone: true }),

    // Email delivery tracking
    /** 'immediate' | 'daily_digest' | 'weekly_digest' */
    emailType: text("email_type"),
    /** 'pending' | 'sent' | 'bounced' | 'failed' */
    emailStatus: text("email_status").default("pending"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    /** External message ID from the email service (e.g., SendGrid) */
    emailServiceId: text("email_service_id"),
    /** Incremented on each retry attempt; max 3 */
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notifications_user").on(table.userId, table.createdAt),
    // Partial indexes — defined in migration DDL:
    // CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC)
    //   WHERE read_at IS NULL;
    // CREATE INDEX idx_notifications_email_pending ON notifications(email_type, created_at)
    //   WHERE email_status = 'pending' AND email_type IS NOT NULL;
  ]
);

export type NotificationSelect = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
