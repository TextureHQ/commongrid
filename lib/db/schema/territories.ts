import { customType, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { regions } from "./regions";

/**
 * Custom PostGIS geography type (MultiPolygon, SRID 4326).
 * Primary storage for accurate spherical calculations.
 */
const geographyMultiPolygon = customType<{ data: string }>({
  dataType() {
    return "geography(MultiPolygon, 4326)";
  },
});

/**
 * Custom PostGIS geometry type (MultiPolygon, SRID 4326).
 * Derived from geography for tile export and planar operations.
 */
const geometryMultiPolygon = customType<{ data: string }>({
  dataType() {
    return "geometry(MultiPolygon, 4326)";
  },
});

/**
 * Custom PostGIS geometry type (Point, SRID 4326) for centroids.
 */
const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});

/**
 * Custom box2d type for bounding boxes.
 */
const box2d = customType<{ data: string }>({
  dataType() {
    return "box2d";
  },
});

/**
 * Territories
 *
 * ~3,000 records. Territory geometries for regions. Each territory
 * stores GEOGRAPHY(MultiPolygon, 4326) as the source of truth, with
 * derived GEOMETRY, simplified, centroid, and computed spatial properties.
 *
 * All Polygon geometries are normalized to MultiPolygon during import.
 */
export const territories = pgTable(
  "territories",
  {
    id: text("id").primaryKey(), // matches region ID (e.g., 'region-st-1000')
    /** FK to regions; ON DELETE CASCADE (territory removed when region removed) */
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),

    /**
     * Primary storage: GEOGRAPHY(MultiPolygon, 4326)
     * Accurate spherical calculations for area, distance, containment.
     */
    geography: geographyMultiPolygon("geography").notNull(),

    /**
     * Derived GEOMETRY for tile export and planar operations.
     * GENERATED ALWAYS AS (geography::geometry) STORED
     */
    geometry: geometryMultiPolygon("geometry"),

    /**
     * Simplified geometry for fast queries at ~1km resolution.
     * GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geography::geometry, 0.01)) STORED
     */
    simplified1km: geometryMultiPolygon("simplified_1km"),

    /**
     * Centroid for labeling and quick-reference lookups.
     * GENERATED ALWAYS AS (ST_Centroid(geography::geometry)) STORED
     */
    centroid: geometryPoint("centroid"),

    /**
     * Bounding box for fast spatial pre-filtering.
     * GENERATED ALWAYS AS (Box2D(geography::geometry)) STORED
     */
    bbox: box2d("bbox"),

    /**
     * Area in square kilometers (precomputed from geography).
     * GENERATED ALWAYS AS (ST_Area(geography) / 1e6) STORED
     */
    areaSqKm: doublePrecision("area_sq_km"),

    /**
     * Vertex count for performance monitoring.
     * GENERATED ALWAYS AS (ST_NPoints(geography::geometry)) STORED
     */
    vertexCount: integer("vertex_count"),

    // Provenance & audit
    source: text("source"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_territories_region_id").on(table.regionId),
    // Spatial indexes (GIST/SPGIST) defined in migration DDL:
    // CREATE INDEX idx_territories_geography ON territories USING GIST(geography);
    // CREATE INDEX idx_territories_geography_nd ON territories USING SPGIST(geography);
    // CREATE INDEX idx_territories_geometry ON territories USING GIST(geometry);
    // CREATE INDEX idx_territories_simplified_1km ON territories USING GIST(simplified_1km);
    index("idx_territories_area").on(table.areaSqKm),
  ]
);

export type TerritorySelect = typeof territories.$inferSelect;
export type TerritoryInsert = typeof territories.$inferInsert;
