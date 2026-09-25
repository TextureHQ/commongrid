import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Rate Structures
 *
 * ~3,000–5,000 published utility rate schedules (V1: residential + commercial),
 * backed by the OpenEI Utility Rate Database (URDB). Each row represents a
 * filed tariff with energy/demand/net-metering structure, provenance, and
 * governance columns.
 */
export const rateStructures = pgTable(
  "rate_structures",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),

    /** EIA utility id — join key to utilities.eia_id / regions.eia_id */
    eiaId: integer("eia_id"),
    /** Resolved utility id (plain text ref; FK convention matches programs/regions) */
    utilityId: text("utility_id"),
    /** Resolved region id (plain text ref; FK convention matches programs/regions) */
    regionId: text("region_id"),

    utilityName: text("utility_name"),
    sector: text("sector"),
    serviceType: text("service_type"),
    description: text("description"),

    fixedCharge: numeric("fixed_charge"),
    fixedChargeUnits: text("fixed_charge_units"),

    energyRateStructure: jsonb("energy_rate_structure"),
    energyWeekdaySchedule: jsonb("energy_weekday_schedule"),
    energyWeekendSchedule: jsonb("energy_weekend_schedule"),

    demandRateStructure: jsonb("demand_rate_structure"),
    flatDemandStructure: jsonb("flat_demand_structure"),
    demandRateUnit: text("demand_rate_unit"),

    netMeteringRules: jsonb("net_metering_rules"),

    /** Derived booleans for explorer filtering */
    hasTou: boolean("has_tou").notNull().default(false),
    hasDemandCharge: boolean("has_demand_charge").notNull().default(false),
    hasNetMetering: boolean("has_net_metering").notNull().default(false),
    isEvRate: boolean("is_ev_rate").notNull().default(false),

    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    approved: boolean("approved").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),

    /** Complete API record: schedules, eligibility, notices and unprojected fields. */
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>(),
    upstreamRecordUrl: text("upstream_record_url"),
    attribution: jsonb("attribution").$type<Record<string, unknown>>(),

    source: text("source"),
    sourceUrl: text("source_url"),
    sourceParentUrl: text("source_parent_url"),
    sourceDate: timestamp("source_date", { withTimezone: true }),

    /** Link health from the weekly URDB sync: null=unchecked, 'ok', 'dead'. */
    sourceUrlStatus: text("source_url_status"),
    sourceUrlCheckedAt: timestamp("source_url_checked_at", { withTimezone: true }),

    /** NULL | 'semi_locked' | 'fully_locked' — denormalized cache from entity_locks table */
    lockedStatus: text("locked_status"),

    // Provenance & audit (mirror regions/programs exactly)
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_rate_structures_slug").on(table.slug),
    index("idx_rate_structures_eia_id").on(table.eiaId),
    index("idx_rate_structures_utility_id").on(table.utilityId),
    index("idx_rate_structures_region_id").on(table.regionId),
    index("idx_rate_structures_sector").on(table.sector),
    index("idx_rate_structures_name_id").on(table.name, table.id),
    index("idx_rate_structures_has_tou").on(table.hasTou),
    index("idx_rate_structures_is_ev_rate").on(table.isEvRate),
  ]
);

export type RateStructureSelect = typeof rateStructures.$inferSelect;
export type RateStructureInsert = typeof rateStructures.$inferInsert;
