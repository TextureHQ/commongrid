import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { regions } from "./regions";

/**
 * Independent System Operators (ISOs)
 *
 * 7 records. ISOs manage the electric grid and wholesale electricity
 * markets in their respective regions.
 */
export const isos = pgTable(
  "isos",
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

    // Provenance & audit
    source: text("source"),
    sourceUrl: text("source_url"),
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [index("idx_isos_slug").on(table.slug)]
);

export type IsoSelect = typeof isos.$inferSelect;
export type IsoInsert = typeof isos.$inferInsert;
