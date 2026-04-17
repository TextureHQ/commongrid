import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * User Notification Preferences
 *
 * Separate table (not JSONB on users) for type safety, queryability, and
 * migration-friendly defaults. One row per user, created atomically with
 * the users row on Clerk `user.created` webhook.
 */
export const userNotificationPrefs = pgTable("user_notification_prefs", {
  /** FK to users; ON DELETE CASCADE — removed when user is removed */
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // Per-event-type delivery preferences
  /** 'email_immediate' | 'email_daily' | 'in_app' | 'off' */
  contributionStatusDelivery: text("contribution_status_delivery").notNull().default("email_immediate"),
  followedChangesDelivery: text("followed_changes_delivery").notNull().default("email_daily"),
  discussionActivityDelivery: text("discussion_activity_delivery").notNull().default("in_app"),
  appealResolvedDelivery: text("appeal_resolved_delivery").notNull().default("email_immediate"),

  // Global toggles
  emailPaused: boolean("email_paused").notNull().default(false),
  /** Hour of day (0–23, UTC) for daily digest emails; NULL = system default */
  digestHour: integer("digest_hour"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserNotificationPrefSelect = typeof userNotificationPrefs.$inferSelect;
export type UserNotificationPrefInsert = typeof userNotificationPrefs.$inferInsert;
