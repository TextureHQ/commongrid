import { boolean, customType, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { balancingAuthorities } from "./balancing-authorities";
import { isos } from "./isos";
import { regions } from "./regions";
import { rtos } from "./rtos";

/**
 * Custom tsvector type for full-text search columns.
 * The actual column is a TSVECTOR managed by a GENERATED ALWAYS AS expression
 * in the migration DDL. Drizzle defines the column so it's available for queries.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Utilities
 *
 * 3,133 records. The largest core entity table. Utilities are the backbone
 * of the US energy grid — IOUs, munis, co-ops, CCAs, and more.
 */
export const utilities = pgTable(
  "utilities",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    eiaName: text("eia_name"),
    shortName: text("short_name"),
    logo: text("logo"),
    website: text("website"),
    eiaId: text("eia_id"),
    segment: text("segment").notNull(), // UtilitySegment enum
    status: text("status").notNull(), // UtilityStatus enum
    customerCount: integer("customer_count"),
    peakDemandMw: doublePrecision("peak_demand_mw"),
    winterPeakDemandMw: doublePrecision("winter_peak_demand_mw"),
    totalRevenueDollars: doublePrecision("total_revenue_dollars"),
    totalSalesMwh: doublePrecision("total_sales_mwh"),
    baCode: text("ba_code"),
    nercRegion: text("nerc_region"),
    hasGeneration: boolean("has_generation"),
    hasTransmission: boolean("has_transmission"),
    hasDistribution: boolean("has_distribution"),
    amiMeterCount: integer("ami_meter_count"),
    totalMeterCount: integer("total_meter_count"),
    jurisdiction: text("jurisdiction"),
    /** FK to isos; ON DELETE RESTRICT (cannot delete ISO while utilities reference it) */
    isoId: text("iso_id").references(() => isos.id, {
      onDelete: "restrict",
    }),
    /** FK to rtos; ON DELETE RESTRICT (cannot delete RTO while utilities reference it) */
    rtoId: text("rto_id").references(() => rtos.id, {
      onDelete: "restrict",
    }),
    /** FK to balancing_authorities; ON DELETE SET NULL */
    balancingAuthorityId: text("balancing_authority_id").references(() => balancingAuthorities.id, {
      onDelete: "set null",
    }),
    /** FK to utilities (self-ref); ON DELETE SET NULL */
    generationProviderId: text("generation_provider_id"),
    /** FK to utilities (self-ref); ON DELETE SET NULL */
    transmissionProviderId: text("transmission_provider_id"),
    /** FK to utilities (self-ref); ON DELETE SET NULL */
    parentId: text("parent_id"),
    /** FK to utilities (self-ref); ON DELETE SET NULL */
    successorId: text("successor_id"),
    serviceTerritoryId: text("service_territory_id").references(() => regions.id, { onDelete: "set null" }),
    notionPageId: text("notion_page_id"),

    /**
     * Full-text search vector — GENERATED ALWAYS AS in DDL:
     * setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
     * setweight(to_tsvector('english', coalesce(eia_name, '')), 'B') ||
     * setweight(to_tsvector('english', coalesce(short_name, '')), 'B') ||
     * setweight(to_tsvector('english', coalesce(jurisdiction, '')), 'C')
     */
    searchVector: tsvector("search_vector"),

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
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_utilities_slug").on(table.slug),
    index("idx_utilities_eia_id").on(table.eiaId),
    index("idx_utilities_segment").on(table.segment),
    index("idx_utilities_status").on(table.status),
    index("idx_utilities_iso_id").on(table.isoId),
    index("idx_utilities_rto_id").on(table.rtoId),
    index("idx_utilities_ba_id").on(table.balancingAuthorityId),
    index("idx_utilities_jurisdiction").on(table.jurisdiction),
    index("idx_utilities_parent_id").on(table.parentId),
    index("idx_utilities_service_territory").on(table.serviceTerritoryId),
    // GIN index for full-text search — defined in migration DDL:
    // CREATE INDEX idx_utilities_search ON utilities USING GIN(search_vector);
    // CREATE INDEX idx_utilities_name_trgm ON utilities USING GIN(name gin_trgm_ops);
  ]
);

export type UtilitySelect = typeof utilities.$inferSelect;
export type UtilityInsert = typeof utilities.$inferInsert;
