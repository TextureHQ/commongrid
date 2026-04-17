import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Changesets — Grouped Edits
 *
 * A changeset groups multiple contributions into a single named batch,
 * allowing contributors to submit related edits together for review.
 * Not all contributions need a changeset — they can be submitted standalone.
 */
export const changesets = pgTable(
  "changesets",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to users; ON DELETE SET NULL — changeset history preserved when user is deleted */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    title: text("title").notNull(),
    description: text("description"),

    /** 'open' | 'submitted' | 'partially_approved' | 'approved' | 'returned' */
    status: text("status").notNull().default("open"),

    contributionCount: integer("contribution_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [index("idx_changesets_user").on(table.userId), index("idx_changesets_status").on(table.status)]
);

export type ChangesetSelect = typeof changesets.$inferSelect;
export type ChangesetInsert = typeof changesets.$inferInsert;
