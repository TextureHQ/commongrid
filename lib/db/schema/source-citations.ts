import { sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { contributions } from "./contributions";

/**
 * Source Citations — Per-Field Source Overrides
 *
 * When individual fields in a contribution have a different source than
 * the contribution-level default (contributions.source_type / source_url),
 * those per-field overrides are stored here.
 *
 * At most one citation per (contribution_id, field_name) pair.
 */
export const sourceCitations = pgTable(
  "source_citations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to contributions; ON DELETE CASCADE */
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),

    fieldName: text("field_name").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    sourceDate: date("source_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("idx_source_citations_unique").on(table.contributionId, table.fieldName),
    index("idx_source_citations_contribution").on(table.contributionId),
  ]
);

export type SourceCitationSelect = typeof sourceCitations.$inferSelect;
export type SourceCitationInsert = typeof sourceCitations.$inferInsert;
