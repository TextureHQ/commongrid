import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Change Batches — Grouped Versions
 *
 * Groups `entity_versions` rows produced by one operation, so the changelog can
 * show "EIA-861 sync updated 12,431 utilities" instead of 12,431 entries.
 *
 * Distinct from `changesets`, which groups contributions awaiting review. A sync
 * run writes versions with no contribution behind them, so it has nothing to
 * group there.
 */
export const changeBatches = pgTable(
  "change_batches",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    /** 'sync' | 'community' | 'admin' | 'backfill' — mirrors entity_versions.source_type */
    sourceType: text("source_type").notNull(),

    /** Shown in the changelog, e.g. "EIA-861 monthly sync" */
    title: text("title").notNull(),
    description: text("description"),

    /** User id for a person, script name for an automated run. */
    initiatedBy: text("initiated_by"),

    /** Maintained by writers; avoids counting entity_versions to render a feed. */
    versionCount: integer("version_count").notNull().default(0),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_change_batches_started_at").on(table.startedAt),
    index("idx_change_batches_source_type").on(table.sourceType),
  ]
);

export type ChangeBatchSelect = typeof changeBatches.$inferSelect;
export type ChangeBatchInsert = typeof changeBatches.$inferInsert;
