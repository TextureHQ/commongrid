import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dataSources } from "./data-sources";
import { utilities } from "./utilities";

/** Published schedules, not household enrollment or calculated bills. */
export const tariffs = pgTable(
  "tariffs",
  {
    id: text("id").primaryKey(),
    upstreamId: text("upstream_id").notNull().unique(),
    name: text("name").notNull(),
    utilityId: text("utility_id").references(() => utilities.id, { onDelete: "set null" }),
    utilityName: text("utility_name").notNull(),
    eiaId: text("eia_id"),
    matchStatus: text("match_status").notNull(),
    sector: text("sector"),
    serviceType: text("service_type"),
    // ISO strings in metadata keep comparisons stable across JSONB/driver round-trips.
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    supersedes: text("supersedes"),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id),
    sourceUrl: text("source_url").notNull(),
    attribution: jsonb("attribution").$type<Record<string, unknown>>().notNull(),
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
    // applySync's createdAt/updatedAt and batch.startedAt record ingestion, not verification.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_tariffs_utility_id").on(table.utilityId),
    index("idx_tariffs_eia_id").on(table.eiaId),
    index("idx_tariffs_sector").on(table.sector),
  ]
);

export type TariffSelect = typeof tariffs.$inferSelect;
