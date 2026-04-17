import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { contributions } from "./contributions";
import { users } from "./users";

/**
 * Contribution Appeals — Dispute Resolution
 *
 * Contributors may appeal a `returned` moderation decision. Appeals are
 * assigned to a senior moderator or admin for independent review and can
 * be `upheld` (original decision stands) or `overturned` (contribution
 * is re-opened for re-review).
 */
export const contributionAppeals = pgTable(
  "contribution_appeals",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to contributions; ON DELETE CASCADE */
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    /** FK to users; ON DELETE SET NULL — preserved when user is deleted */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    reason: text("reason").notNull(),

    /** 'under_review' | 'upheld' | 'overturned' */
    status: text("status").notNull().default("under_review"),

    assignedTo: text("assigned_to").references(() => users.id),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolutionNote: text("resolution_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_appeals_contribution").on(table.contributionId),
    index("idx_appeals_status").on(table.status),
    // Partial index — defined in migration DDL:
    // CREATE INDEX idx_appeals_assigned ON contribution_appeals(assigned_to)
    //   WHERE assigned_to IS NOT NULL;
  ]
);

export type ContributionAppealSelect = typeof contributionAppeals.$inferSelect;
export type ContributionAppealInsert = typeof contributionAppeals.$inferInsert;
