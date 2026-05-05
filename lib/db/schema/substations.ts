import { customType, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
 * Substations
 *
 * The 9th CommonGrid entity type. Every substation in the US,
 * sourced from EIA's substations FeatureService + OpenStreetMap (ODbL attribution),
 * with optional manual contributions and hybrid (merged) records.
 *
 * Follows the same conventions as power_plants and ev_stations:
 *   • text primary key (UUID-like slug-derived id)
 *   • doublePrecision lat/lng + GENERATED geography/geometry columns
 *   • notNull soft-delete audit block (createdAt, updatedAt, deletedAt, version)
 *   • tsvector search column driven by a migration-level GENERATED expression
 *   • spatial + full-text indexes defined in migration DDL
 *
 * Schema spec: memory/specs/ninth-entry-point-research.md
 */
export const substations = pgTable(
  "substations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),

    // Ownership
    ownerName: text("owner_name"),
    ownerUtilityId: text("owner_utility_id").references(() => utilities.id, {
      onDelete: "set null",
    }),

    // Location
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

    // Electrical characteristics
    minVoltageKv: integer("min_voltage_kv"),
    maxVoltageKv: integer("max_voltage_kv"),

    /** 'transmission' | 'distribution' | 'hybrid' | 'unknown' */
    substationType: text("substation_type").notNull().default("unknown"),
    /** 'in_service' | 'out_of_service' | 'planned' | 'retired' | 'unknown' */
    status: text("status").notNull().default("unknown"),

    // Source lineage (ODbL attribution for OSM-derived records)
    /** 'eia' | 'osm' | 'manual' | 'hybrid' */
    source: text("source").notNull().default("manual"),
    sourceUrl: text("source_url"),
    eiaId: text("eia_id"),
    /** OSM id prefixed with element type, e.g. 'node/123', 'way/456', 'relation/789' */
    osmId: text("osm_id"),
    /** Legacy HIFLD substation id, for future reconciliation with retired HIFLD feeds. */
    hifldLegacyId: text("hifld_legacy_id"),

    /**
     * Full-text search vector — GENERATED ALWAYS AS in DDL:
     * setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
     * setweight(to_tsvector('english', coalesce(owner_name, '')), 'B') ||
     * setweight(to_tsvector('english', coalesce(state, '')), 'C') ||
     * setweight(to_tsvector('english', coalesce(county, '')), 'C')
     */
    searchVector: tsvector("search_vector"),

    /** NULL | 'semi_locked' | 'fully_locked' — denormalized cache from entity_locks table */
    lockedStatus: text("locked_status"),

    // Provenance & audit
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_sub_slug").on(table.slug),
    index("idx_sub_owner_utility_id").on(table.ownerUtilityId),
    index("idx_sub_state").on(table.state),
    index("idx_sub_substation_type").on(table.substationType),
    index("idx_sub_status").on(table.status),
    index("idx_sub_source").on(table.source),
    index("idx_sub_eia_id").on(table.eiaId),
    index("idx_sub_osm_id").on(table.osmId),
    // Spatial indexes (GIST/SPGIST) defined in migration DDL:
    // CREATE INDEX idx_sub_geography ON substations USING GIST(geography);
    // CREATE INDEX idx_sub_geography_nd ON substations USING SPGIST(geography);
    // CREATE INDEX idx_sub_geometry ON substations USING GIST(geometry);
    // Search indexes defined in migration DDL:
    // CREATE INDEX idx_sub_search ON substations USING GIN(search_vector);
    // CREATE INDEX idx_sub_name_trgm ON substations USING GIN(name gin_trgm_ops);
  ]
);

export type SubstationSelect = typeof substations.$inferSelect;
export type SubstationInsert = typeof substations.$inferInsert;
