import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { discussionThreads } from "./discussion-threads";
import { users } from "./users";

/**
 * Discussion Posts — Thread Comments
 *
 * Supports threaded replies via the self-referential `reply_to_id` column.
 * Reply cycle prevention is enforced by the `prevent_reply_cycles()` trigger
 * — see migration DDL §6.2.
 */
export const discussionPosts = pgTable(
  "discussion_posts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to discussion_threads; ON DELETE CASCADE */
    threadId: text("thread_id")
      .notNull()
      .references(() => discussionThreads.id, { onDelete: "cascade" }),
    /** FK to users; ON DELETE SET NULL */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * Self-referential FK for threaded replies.
     * ON DELETE SET NULL — reply becomes a root post if its parent is deleted.
     * Cycle prevention enforced by prevent_reply_cycles() trigger.
     */
    replyToId: text("reply_to_id").references((): AnyPgColumn => discussionPosts.id, { onDelete: "set null" }),

    body: text("body").notNull(),

    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedBy: text("pinned_by").references(() => users.id),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_posts_thread").on(table.threadId, table.createdAt),
    index("idx_posts_user").on(table.userId),
    // Partial index — defined in migration DDL:
    // CREATE INDEX idx_posts_pinned ON discussion_posts(thread_id, is_pinned)
    //   WHERE is_pinned = true;
  ]
);

export type DiscussionPostSelect = typeof discussionPosts.$inferSelect;
export type DiscussionPostInsert = typeof discussionPosts.$inferInsert;
