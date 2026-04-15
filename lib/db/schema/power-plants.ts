import { customType, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { balancingAuthorities } from "./balancing-authorities";
import { utilities } from "./utilities";

/**
 * Custom tsvector type for full-text search columns.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Custom PostGIS geography type (Point, SRID 4326).
 * Stored as GEOGRAPHY for accurate spherical calculations.
 * Actual GENERATED ALWAYS AS expression defined in migration DDL.
 */
const geography = customType<{ data: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

/**
 * Custom PostGIS geometry type (Point, SRID 4326).
 * Derived GEOMETRY for tile export and planar bbox queries.
 * Actual GENERATED ALWAYS AS expression defined in migration DDL.
 */
const geometry = customType<{ data: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});

/**
 * Power Plants
 *
 * 15,082 records. Every utility-scale power generation facility
 * in the US, sourced from EIA Form 860.
 */
export const powerPlants = pgTable(
  "power_plants",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    plantCode: text("plant_code").notNull(),
    utilityId: text("utility_id").references(() => utilities.id, {
      onDelete: "set null",
    }),
    utilityName: text("utility_name").notNull(),
    balancingAuthorityId: text("balancing_authority_id").references(() => balancingAuthorities.id, {
      onDelete: "set null",
    }),
    baCode: text("ba_code"),
    state: text("state").notNull(),
    county: text("county"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),

    /**
     * GEOGRAPHY(Point, 4326) — source of truth for accurate distance/area.
     * GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED
     */
    geography: geography("geography"),

    /**
     * GEOMETRY(Point, 4326) — derived for tile export and planar bbox queries.
     * GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED
     */
    geometry: geometry("geometry"),

    nercRegion: text("nerc_region"),
    sector: text("sector").notNull(),
    primaryFuel: text("primary_fuel"),
    fuelCategory: text("fuel_category").notNull(), // FuelCategory enum
    technologies: jsonb("technologies").notNull().default([]),
    energySources: jsonb("energy_sources").notNull().default([]),
    totalCapacityMw: doublePrecision("total_capacity_mw").notNull(),
    generatorCount: integer("generator_count").notNull(),
    operatingYear: integer("operating_year"),
    gridVoltageKv: doublePrecision("grid_voltage_kv"),
    status: text("status").notNull(), // 'operable' | 'proposed'
    proposedCapacityMw: doublePrecision("proposed_capacity_mw"),
    proposedOnlineYear: integer("proposed_online_year"),

    /**
     * Full-text search vector — GENERATED ALWAYS AS in DDL:
     * setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
     * setweight(to_tsvector('english', coalesce(utility_name, '')), 'B') ||
     * setweight(to_tsvector('english', coalesce(state, '')), 'C') ||
     * setweight(to_tsvector('english', coalesce(county, '')), 'C')
     */
    searchVector: tsvector("search_vector"),

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
    index("idx_pp_slug").on(table.slug),
    index("idx_pp_plant_code").on(table.plantCode),
    index("idx_pp_utility_id").on(table.utilityId),
    index("idx_pp_ba_id").on(table.balancingAuthorityId),
    index("idx_pp_state").on(table.state),
    index("idx_pp_fuel_category").on(table.fuelCategory),
    index("idx_pp_status").on(table.status),
    // Spatial indexes (GIST/SPGIST) defined in migration DDL:
    // CREATE INDEX idx_pp_geography ON power_plants USING GIST(geography);
    // CREATE INDEX idx_pp_geography_nd ON power_plants USING SPGIST(geography);
    // CREATE INDEX idx_pp_geometry ON power_plants USING GIST(geometry);
    // Search indexes defined in migration DDL:
    // CREATE INDEX idx_pp_search ON power_plants USING GIN(search_vector);
    // CREATE INDEX idx_pp_name_trgm ON power_plants USING GIN(name gin_trgm_ops);
  ]
);

export type PowerPlantSelect = typeof powerPlants.$inferSelect;
export type PowerPlantInsert = typeof powerPlants.$inferInsert;
