import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Entity Follows — Watchlist
 *
 * Users follow individual entities to receive notifications when
 * contributions are approved or new discussions are created.
 * Phase 1 supports individual entity following only.
 *
 * Entity references are validated by the `validate_entity_reference()`
 * trigger — see migration DDL §6.1.
 */
export const entityFollows = pgTable(
  "entity_follows",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to users; ON DELETE CASCADE */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    notifyAllChanges: boolean("notify_all_changes").notNull().default(true),
    notifyDiscussions: boolean("notify_discussions").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("idx_follows_unique").on(table.userId, table.entityType, table.entityId),
    index("idx_follows_user").on(table.userId),
    index("idx_follows_entity").on(table.entityType, table.entityId),
  ]
);

export type EntityFollowSelect = typeof entityFollows.$inferSelect;
export type EntityFollowInsert = typeof entityFollows.$inferInsert;
