import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Entity Locks — Protection System
 *
 * Prevents community contributions on an entity. Two lock levels:
 * - `semi_locked`: trusted contributors can still edit; regular contributors blocked
 * - `fully_locked`: all community edits blocked; only moderators/admins can edit
 *
 * The `locked_status` column on each entity table is a denormalized cache
 * that MUST be updated in the same transaction as entity_locks INSERT/UPDATE/DELETE.
 * `entity_locks` is the source of truth; `locked_status` is a read-performance cache.
 *
 * Entity references are validated by the `validate_entity_reference()` trigger.
 */
export const entityLocks = pgTable(
  "entity_locks",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    /** 'semi_locked' | 'fully_locked' */
    lockLevel: text("lock_level").notNull(),
    reason: text("reason"),

    lockedBy: text("locked_by")
      .notNull()
      .references(() => users.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = indefinite lock */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    unique("entity_locks_entity_unique").on(table.entityType, table.entityId),
    index("idx_entity_locks_level").on(table.lockLevel),
  ]
);

export type EntityLockSelect = typeof entityLocks.$inferSelect;
export type EntityLockInsert = typeof entityLocks.$inferInsert;
