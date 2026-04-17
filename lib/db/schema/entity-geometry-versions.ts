import {
  bigint,
  bigserial,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { contributions } from "./contributions";
import { entityVersions } from "./entity-versions";

/**
 * Custom generic PostGIS GEOGRAPHY type.
 */
const geography = customType<{ data: string }>({
  dataType() {
    return "geography";
  },
});

/**
 * Custom generic PostGIS GEOMETRY type.
 */
const geometry = customType<{ data: string }>({
  dataType() {
    return "geometry";
  },
});

/**
 * Entity Geometry Versions — Spatial Version History
 *
 * Stores PostGIS GEOGRAPHY snapshots for entities with spatial data.
 * Kept separate from `entity_versions` (attribute deltas) because:
 * - Only ~20% of entities have geometry — avoids bloating the attribute table
 * - PostGIS columns (especially MultiPolygon) are large
 * - Spatial indexes enable historical queries like "all boundaries containing
 *   this point at version N"
 *
 * Spatial index on geography_snapshot — defined in migration DDL:
 *   CREATE INDEX idx_egv_geography ON entity_geometry_versions
 *     USING GIST(geography_snapshot)
 *     WHERE geography_snapshot IS NOT NULL;
 */
export const entityGeometryVersions = pgTable(
  "entity_geometry_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    versionNumber: integer("version_number").notNull(),

    // Actual PostGIS types (not JSONB)
    geographySnapshot: geography("geography_snapshot"),
    geometrySnapshot: geometry("geometry_snapshot"),

    // Spatial metadata (computed at insert time)
    /** ST_GeometryType result: 'ST_Point' | 'ST_MultiPolygon' | etc. */
    geometryType: text("geometry_type"),
    /** ST_Area(geography_snapshot) / 1e6 if polygon */
    areaSqKm: doublePrecision("area_sq_km"),
    /** ST_Y(ST_Centroid(geography_snapshot::geometry)) */
    centroidLat: doublePrecision("centroid_lat"),
    /** ST_X(ST_Centroid(geography_snapshot::geometry)) */
    centroidLng: doublePrecision("centroid_lng"),

    /** FK to entity_versions; ON DELETE CASCADE */
    entityVersionId: bigint("entity_version_id", { mode: "number" }).references(() => entityVersions.id, {
      onDelete: "cascade",
    }),

    /** FK to contributions; ON DELETE SET NULL — preserved when contribution is removed */
    contributionId: text("contribution_id").references(() => contributions.id, {
      onDelete: "set null",
    }),

    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("entity_geometry_versions_entity_type_entity_id_version_number_unique").on(
      table.entityType,
      table.entityId,
      table.versionNumber
    ),
    index("idx_egv_entity").on(table.entityType, table.entityId),
    index("idx_egv_version").on(table.entityVersionId),
    // Spatial index — defined in migration DDL:
    // CREATE INDEX idx_egv_geography ON entity_geometry_versions
    //   USING GIST(geography_snapshot)
    //   WHERE geography_snapshot IS NOT NULL;
  ]
);

export type EntityGeometryVersionSelect = typeof entityGeometryVersions.$inferSelect;
export type EntityGeometryVersionInsert = typeof entityGeometryVersions.$inferInsert;
