import { customType, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
 * Pricing Nodes
 *
 * 4,065 records. Wholesale electricity pricing nodes across all 7 US
 * ISOs/RTOs. Sources: CAISO OASIS, PJM, ERCOT, MISO, NYISO, ISO-NE, SPP.
 */
export const pricingNodes = pgTable(
  "pricing_nodes",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    iso: text("iso").notNull(), // IsoRto enum: 'CAISO', 'PJM', etc.
    nodeType: text("node_type").notNull(), // PricingNodeType enum
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

    zone: text("zone"),
    state: text("state"),
    voltageKv: doublePrecision("voltage_kv"),
    eiaPlantCode: text("eia_plant_code"),

    // Provenance & audit
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    submittedBy: text("submitted_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_pn_slug").on(table.slug),
    index("idx_pn_iso").on(table.iso),
    index("idx_pn_node_type").on(table.nodeType),
    index("idx_pn_state").on(table.state),
    // Spatial indexes (GIST/SPGIST) defined in migration DDL:
    // CREATE INDEX idx_pn_geography ON pricing_nodes USING GIST(geography);
    // CREATE INDEX idx_pn_geography_nd ON pricing_nodes USING SPGIST(geography);
    // CREATE INDEX idx_pn_geometry ON pricing_nodes USING GIST(geometry);
    // Search index defined in migration DDL:
    // CREATE INDEX idx_pn_name_trgm ON pricing_nodes USING GIN(name gin_trgm_ops);
  ]
);

export type PricingNodeSelect = typeof pricingNodes.$inferSelect;
export type PricingNodeInsert = typeof pricingNodes.$inferInsert;
