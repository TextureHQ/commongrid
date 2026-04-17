import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Discussion Threads — Per-Entity Conversations
 *
 * Each thread is attached to a single entity via the polymorphic
 * (entity_type, entity_id) pair. Entity references are validated by
 * the `validate_entity_reference()` trigger — see migration DDL §6.1.
 */
export const discussionThreads = pgTable(
  "discussion_threads",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    title: text("title").notNull(),

    /** 'open' | 'closed' */
    status: text("status").notNull().default("open"),

    /** FK to users; ON DELETE SET NULL */
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    closedBy: text("closed_by").references(() => users.id),

    postCount: integer("post_count").notNull().default(0),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_threads_entity").on(table.entityType, table.entityId),
    index("idx_threads_status").on(table.status),
    index("idx_threads_last_post").on(table.lastPostAt),
  ]
);

export type DiscussionThreadSelect = typeof discussionThreads.$inferSelect;
export type DiscussionThreadInsert = typeof discussionThreads.$inferInsert;
