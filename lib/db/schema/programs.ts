import { customType, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Custom tsvector type for full-text search columns.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Programs (Demand Response, DER, VPP, etc.)
 *
 * 607 records. Grid flexibility programs — demand response, virtual power
 * plants, DER aggregation, etc. Heavy JSONB usage for nested structures
 * (organizations, asset types, compensation tiers, variants).
 */
export const programs = pgTable(
  "programs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** ProgramOrganization[] — { entityId, role } */
    organizations: jsonb("organizations").notNull().default([]),
    /** AssetType[] enum values */
    assetTypes: jsonb("asset_types").notNull().default([]),
    /** MarketSegment[] enum values */
    marketSegments: jsonb("market_segments").notNull().default([]),
    /** ParticipationModel[] enum values */
    participationModels: jsonb("participation_models").notNull().default([]),
    /** IncentiveStructure[] enum values */
    incentiveStructures: jsonb("incentive_structures").notNull().default([]),
    /** GridService[] enum values */
    gridServices: jsonb("grid_services").notNull().default([]),
    /** string[] — region IDs */
    regions: jsonb("regions").notNull().default([]),
    /** CompensationTier[] — { tier, type, amount, unit, description? } */
    compensationTiers: jsonb("compensation_tiers").notNull().default([]),
    capacityTarget: doublePrecision("capacity_target"),
    maxEnrollments: integer("max_enrollments"),
    /** ProgramSeason — { startMonth, endMonth, description? } */
    programSeason: jsonb("program_season"),
    launchedAt: text("launched_at"),
    enrollmentOpens: text("enrollment_opens"),
    enrollmentCloses: text("enrollment_closes"),
    endsAt: text("ends_at"),
    status: text("status").notNull(), // ProgramStatus enum
    programWebsite: text("program_website"),
    faqUrl: text("faq_url"),
    termsUrl: text("terms_url"),
    contactUrl: text("contact_url"),
    dermsVendor: text("derms_vendor"),
    otherNotes: text("other_notes"),
    /** ProgramVariant[] — full variant objects */
    variants: jsonb("variants").notNull().default([]),

    /**
     * Full-text search vector — GENERATED ALWAYS AS in DDL:
     * setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
     * setweight(to_tsvector('english', coalesce(description, '')), 'B')
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_programs_slug").on(table.slug),
    index("idx_programs_status").on(table.status),
    // GIN indexes defined in migration DDL:
    // CREATE INDEX idx_programs_search ON programs USING GIN(search_vector);
    // CREATE INDEX idx_programs_name_trgm ON programs USING GIN(name gin_trgm_ops);
    // CREATE INDEX idx_programs_asset_types ON programs USING GIN(asset_types);
    // CREATE INDEX idx_programs_grid_services ON programs USING GIN(grid_services);
    // CREATE INDEX idx_programs_organizations ON programs USING GIN(organizations);
  ]
);

export type ProgramSelect = typeof programs.$inferSelect;
export type ProgramInsert = typeof programs.$inferInsert;
