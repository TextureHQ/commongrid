import { customType, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Custom PostGIS geometry type (MultiLineString, SRID 4326).
 * Source of truth for transmission-line geometry so tiles are rebuilt from
 * Postgres instead of a committed GeoJSON artifact (CG-328).
 */
const geometryMultiLineString = customType<{ data: string }>({
  dataType() {
    return "geometry(MultiLineString, 4326)";
  },
});

/**
 * Transmission Lines
 *
 * ~52k records. Metadata for electric power transmission lines, sourced from
 * HIFLD. Geometry (large MultiLineStrings) is stored in the `geometry` column
 * in PostGIS as the single source of truth for tile generation (CG-328). The
 * previously-committed data/transmission-lines.geojson artifact is gone.
 */
export const transmissionLines = pgTable(
  "transmission_lines",
  {
    id: text("id").primaryKey(),
    objectId: integer("object_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    owner: text("owner").notNull(),
    voltage: doublePrecision("voltage"),
    voltClass: text("volt_class").notNull(),
    voltageClass: text("voltage_class").notNull(), // VoltageClass enum
    sub1: text("sub1").notNull(),
    sub2: text("sub2").notNull(),
    lengthMiles: doublePrecision("length_miles"),
    naicsCode: text("naics_code").notNull(),

    /**
     * GEOMETRY(MultiLineString, 4326) — source of truth for tile export.
     * Populated by sync-transmission-lines.ts from HIFLD; read back by
     * prepare-transmission-lines-geojson.mjs via ST_AsGeoJSON (CG-328).
     */
    geometry: geometryMultiLineString("geometry"),

    /** NULL | 'semi_locked' | 'fully_locked' — denormalized cache from entity_locks table */
    lockedStatus: text("locked_status"),

    // Provenance & audit
    source: text("source").notNull().default("HIFLD"),
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
    index("idx_tl_object_id").on(table.objectId),
    index("idx_tl_voltage_class").on(table.voltageClass),
    index("idx_tl_owner").on(table.owner),
    index("idx_tl_status").on(table.status),
    // Trigram index defined in migration DDL:
    // CREATE INDEX idx_tl_owner_trgm ON transmission_lines USING GIN(owner gin_trgm_ops);
  ]
);

export type TransmissionLineSelect = typeof transmissionLines.$inferSelect;
export type TransmissionLineInsert = typeof transmissionLines.$inferInsert;
