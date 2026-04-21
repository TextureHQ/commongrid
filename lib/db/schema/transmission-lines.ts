import { doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Transmission Lines
 *
 * 52,244 records. Metadata for electric power transmission lines,
 * sourced from HIFLD. Geometry is stored in PMTiles for map rendering,
 * not in this table (individual line geometries are large LineStrings
 * with many coordinates, used only for tile generation).
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
    lengthMiles: doublePrecision("length_miles").notNull(),
    naicsCode: text("naics_code").notNull(),

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
