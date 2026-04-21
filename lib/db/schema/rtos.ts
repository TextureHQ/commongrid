import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { regions } from "./regions";

/**
 * Regional Transmission Organizations (RTOs)
 *
 * 7 records. RTOs coordinate the movement of wholesale electricity
 * across their transmission networks.
 */
export const rtos = pgTable(
  "rtos",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    logo: text("logo"),
    website: text("website"),
    states: text("states").array().notNull().default([]),
    regionId: text("region_id").references(() => regions.id, {
      onDelete: "set null",
    }),

    /** NULL | 'semi_locked' | 'fully_locked' — denormalized cache from entity_locks table */
    lockedStatus: text("locked_status"),

    // Provenance & audit
    source: text("source"),
    sourceUrl: text("source_url"),
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [index("idx_rtos_slug").on(table.slug)]
);

export type RtoSelect = typeof rtos.$inferSelect;
export type RtoInsert = typeof rtos.$inferInsert;
