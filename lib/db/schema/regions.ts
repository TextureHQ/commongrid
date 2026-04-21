import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Regions
 *
 * ~3,000 records. Regions represent geographic areas — service territories,
 * states, counties, ISO/RTO boundaries, CCA territories, etc.
 */
export const regions = pgTable(
  "regions",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(), // RegionType enum value
    eiaId: text("eia_id"),
    state: text("state"),
    customers: integer("customers"),

    /** NULL | 'semi_locked' | 'fully_locked' — denormalized cache from entity_locks table */
    lockedStatus: text("locked_status"),

    // Provenance & audit
    source: text("source"),
    sourceUrl: text("source_url"),
    sourceDate: text("source_date"), // preserving existing field
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_regions_slug").on(table.slug),
    index("idx_regions_eia_id").on(table.eiaId),
    index("idx_regions_type").on(table.type),
    index("idx_regions_state").on(table.state),
  ]
);

export type RegionSelect = typeof regions.$inferSelect;
export type RegionInsert = typeof regions.$inferInsert;
