import { boolean, doublePrecision, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { powerPlants } from "./power-plants";
import { substations } from "./substations";

/**
 * Power Plant Interconnections
 *
 * Join table linking power plants to their nearest substation(s).
 * Computed via spatial distance (ST_Distance in PostGIS) to identify
 * the likely interconnection point on the grid.
 *
 * Typically, a power plant has 1 primary interconnection (isPrimary=true)
 * and may have 0+ secondary candidates within a configured radius.
 *
 * Distance is stored in meters for precise filtering.
 */
export const powerPlantInterconnections = pgTable(
  "power_plant_interconnections",
  {
    powerPlantId: text("power_plant_id")
      .notNull()
      .references(() => powerPlants.id, { onDelete: "cascade" }),
    substationId: text("substation_id")
      .notNull()
      .references(() => substations.id, { onDelete: "cascade" }),
    distanceMeters: doublePrecision("distance_meters").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.powerPlantId, table.substationId] }),
  ]
);

export type PowerPlantInterconnectionSelect = typeof powerPlantInterconnections.$inferSelect;
export type PowerPlantInterconnectionInsert = typeof powerPlantInterconnections.$inferInsert;
