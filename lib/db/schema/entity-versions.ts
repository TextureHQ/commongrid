import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  bigserial,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Entity Versions (Delta-Based)
 *
 * Tracks change history for all entity types using a delta-based approach:
 * - Version 1: stores a full JSONB snapshot of the entity.
 * - Version 2+: stores only the delta ({ field: { old, new } }).
 *
 * Reconstruct any version by loading v1 snapshot and applying deltas in order.
 *
 * Storage savings: ~75x vs full snapshots (~100 bytes per delta vs ~1.5 KB per snapshot).
 *
 * CHECK constraint ensures exactly one of snapshot/delta is non-null:
 *   (snapshot IS NOT NULL AND delta IS NULL) OR (snapshot IS NULL AND delta IS NOT NULL)
 * — enforced in migration DDL.
 */
export const entityVersions = pgTable(
  "entity_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(), // 'utility', 'iso', 'power_plant', etc.
    entityId: text("entity_id").notNull(), // FK to the entity's primary key
    versionNumber: integer("version_number").notNull(),

    /** Full JSONB snapshot — non-null only for v1 */
    snapshot: jsonb("snapshot"),
    /** Delta: { field: { old, new } } — null for v1 */
    delta: jsonb("delta"),

    changedBy: text("changed_by"), // who made this change
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    changeType: text("change_type").notNull(), // 'create', 'update', 'delete'
    changeSummary: text("change_summary"), // human-readable summary
  },
  (table) => [
    unique("entity_versions_entity_type_entity_id_version_number_unique").on(
      table.entityType,
      table.entityId,
      table.versionNumber
    ),
    index("idx_ev_entity").on(table.entityType, table.entityId),
    index("idx_ev_changed_at").on(table.changedAt),
    index("idx_ev_change_type").on(table.changeType),
  ]
);

export type EntityVersionSelect = typeof entityVersions.$inferSelect;
export type EntityVersionInsert = typeof entityVersions.$inferInsert;
