import { boolean, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * Community Editable Fields — Field Metadata
 *
 * Defines which fields are community-editable per entity type, whether
 * they're critical (require review even for trusted contributors), and
 * their validation rules.
 *
 * Primarily seed/configuration data — populated during migration, rarely
 * changed at runtime.
 *
 * Used for:
 * - Write-time Zod validation: validates contributions.changes field names
 * - Auto-approval rules: only non-critical fields from trusted contributors
 * - Moderation UI: displays field labels and validation hints to moderators
 *
 * Example seed data:
 *   ('utility', 'website', 'url', false, 'Website', NULL)
 *   ('utility', 'customer_count', 'integer', true, 'Customer Count', '{"min": 0}')
 *   ('utility', 'peak_demand_mw', 'float', true, 'Peak Demand (MW)', '{"min": 0}')
 *   ('power_plant', 'total_capacity_mw', 'float', true, 'Total Capacity (MW)', '{"min": 0}')
 *   ('ev_station', 'ev_pricing', 'text', false, 'EV Pricing', NULL)
 */
export const communityEditableFields = pgTable(
  "community_editable_fields",
  {
    entityType: text("entity_type").notNull(),
    fieldName: text("field_name").notNull(),
    /** 'text' | 'integer' | 'float' | 'boolean' | 'enum' | 'url' */
    fieldType: text("field_type").notNull(),
    /** Critical fields require review even for trusted contributors */
    isCritical: boolean("is_critical").notNull().default(false),
    /** Human-readable label for the moderation UI */
    displayName: text("display_name"),
    /** e.g., {"min": 0, "max": 1000000} */
    validationRules: jsonb("validation_rules"),
  },
  (table) => [primaryKey({ columns: [table.entityType, table.fieldName] })]
);

export type CommunityEditableFieldSelect = typeof communityEditableFields.$inferSelect;
export type CommunityEditableFieldInsert = typeof communityEditableFields.$inferInsert;
