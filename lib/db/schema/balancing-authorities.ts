import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { isos } from "./isos";
import { regions } from "./regions";

/**
 * Balancing Authorities (BAs)
 *
 * 45 records. BAs balance electricity supply and demand in real time
 * within their footprint.
 */
export const balancingAuthorities = pgTable(
  "balancing_authorities",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    logo: text("logo"),
    eiaCode: text("eia_code"),
    eiaId: text("eia_id"),
    website: text("website"),
    states: text("states").array().notNull().default([]),
    /** FK to isos; ON DELETE SET NULL (ISOs may be reorganized) */
    isoId: text("iso_id").references(() => isos.id, {
      onDelete: "set null",
    }),
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
  (table) => [
    index("idx_bas_slug").on(table.slug),
    index("idx_bas_eia_code").on(table.eiaCode),
    index("idx_bas_eia_id").on(table.eiaId),
    index("idx_bas_iso_id").on(table.isoId),
  ]
);

export type BalancingAuthoritySelect = typeof balancingAuthorities.$inferSelect;
export type BalancingAuthorityInsert = typeof balancingAuthorities.$inferInsert;
