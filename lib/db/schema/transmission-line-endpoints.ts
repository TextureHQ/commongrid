import { doublePrecision, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { transmissionLines } from "./transmission-lines";
import { substations } from "./substations";

/**
 * Transmission Line Endpoints
 *
 * Join table linking transmission lines to substations at their endpoints.
 * Replaces the fuzzy `transmission_lines.sub1` / `sub2` string references
 * with formal foreign keys.
 *
 * Each transmission line has exactly 2 endpoints (from/to).
 * `matchConfidence` (0..1) indicates the quality of the fuzzy name match
 * used to populate this join — used for filtering and community review workflow.
 */
export const transmissionLineEndpoints = pgTable(
  "transmission_line_endpoints",
  {
    transmissionLineId: text("transmission_line_id")
      .notNull()
      .references(() => transmissionLines.id, { onDelete: "cascade" }),
    substationId: text("substation_id")
      .notNull()
      .references(() => substations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'from' | 'to'
    matchConfidence: doublePrecision("match_confidence"), // 0..1, NULL if manual / verified
  },
  (table) => [
    primaryKey({
      columns: [table.transmissionLineId, table.substationId, table.role],
    }),
  ]
);

export type TransmissionLineEndpointSelect = typeof transmissionLineEndpoints.$inferSelect;
export type TransmissionLineEndpointInsert = typeof transmissionLineEndpoints.$inferInsert;
