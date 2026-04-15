import {
  pgTable,
  text,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";

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
 */
const geography = customType<{ data: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

/**
 * Custom PostGIS geometry type (Point, SRID 4326).
 */
const geometry = customType<{ data: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});

/**
 * EV Charging Stations
 *
 * 85,425 records. Every public/private EV charging station in the US,
 * sourced from DOE AFDC (Alternative Fuels Data Center).
 */
export const evStations = pgTable(
  "ev_stations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    stationName: text("station_name").notNull(),
    streetAddress: text("street_address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),

    /**
     * GEOGRAPHY(Point, 4326) — source of truth for accurate distance.
     * GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED
     */
    geography: geography("geography"),

    /**
     * GEOMETRY(Point, 4326) — derived for tile export.
     * GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED
     */
    geometry: geometry("geometry"),

    evNetwork: text("ev_network"),
    evLevel1EvseNum: integer("ev_level1_evse_num").notNull().default(0),
    evLevel2EvseNum: integer("ev_level2_evse_num").notNull().default(0),
    evDcFastNum: integer("ev_dc_fast_num").notNull().default(0),
    evConnectorTypes: jsonb("ev_connector_types").notNull().default([]),
    accessCode: text("access_code").notNull(), // 'public' | 'private' | 'restricted'
    statusCode: text("status_code").notNull(), // 'E' | 'P' | 'T'
    openDate: text("open_date"),
    facilityType: text("facility_type"),
    ownerTypeCode: text("owner_type_code"),
    evPricing: text("ev_pricing"),

    /**
     * Full-text search vector — GENERATED ALWAYS AS in DDL:
     * setweight(to_tsvector('english', coalesce(station_name, '')), 'A') ||
     * setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
     * setweight(to_tsvector('english', coalesce(street_address, '')), 'C')
     */
    searchVector: tsvector("search_vector"),

    // Provenance & audit
    source: text("source"),
    sourceUrl: text("source_url"),
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_ev_slug").on(table.slug),
    index("idx_ev_state").on(table.state),
    index("idx_ev_network").on(table.evNetwork),
    index("idx_ev_access").on(table.accessCode),
    index("idx_ev_status").on(table.statusCode),
    // Spatial indexes (GIST/SPGIST) defined in migration DDL:
    // CREATE INDEX idx_ev_geography ON ev_stations USING GIST(geography);
    // CREATE INDEX idx_ev_geography_nd ON ev_stations USING SPGIST(geography);
    // CREATE INDEX idx_ev_geometry ON ev_stations USING GIST(geometry);
    // Search indexes defined in migration DDL:
    // CREATE INDEX idx_ev_search ON ev_stations USING GIN(search_vector);
    // CREATE INDEX idx_ev_name_trgm ON ev_stations USING GIN(station_name gin_trgm_ops);
  ]
);

export type EvStationSelect = typeof evStations.$inferSelect;
export type EvStationInsert = typeof evStations.$inferInsert;
