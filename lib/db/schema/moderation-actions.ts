import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Moderation Actions — Full Audit Log
 *
 * Every moderation action is recorded here for accountability, audit trails,
 * and moderator activity reporting. Stores both the contributor-visible
 * comment and an internal moderator note.
 */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    moderatorId: text("moderator_id")
      .notNull()
      .references(() => users.id),

    /**
     * 'approve' | 'return' | 'request_changes' | 'defer'
     * | 'ban_user' | 'unban_user' | 'warn_user'
     * | 'promote_trusted' | 'demote_trusted'
     * | 'lock_entity' | 'unlock_entity'
     * | 'revert_contribution' | 'batch_revert'
     * | 'pin_post' | 'delete_post' | 'close_thread'
     * | 'resolve_appeal'
     */
    actionType: text("action_type").notNull(),

    /** 'contribution' | 'user' | 'entity' | 'discussion_post' | 'appeal' */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),

    comment: text("comment"),
    internalNote: text("internal_note"),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mod_actions_moderator").on(table.moderatorId, table.createdAt),
    index("idx_mod_actions_target").on(table.targetType, table.targetId),
    index("idx_mod_actions_type").on(table.actionType),
    index("idx_mod_actions_created").on(table.createdAt),
  ]
);

export type ModerationActionSelect = typeof moderationActions.$inferSelect;
export type ModerationActionInsert = typeof moderationActions.$inferInsert;
