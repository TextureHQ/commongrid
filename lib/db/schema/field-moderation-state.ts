import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { contributions } from "./contributions";
import { sourceCitations } from "./source-citations";
import { users } from "./users";

/**
 * Field Moderation State — Durable Human-Edit Protection Ledger
 *
 * Source of truth for which fields a human decision has approved and when.
 * Sits ABOVE the last-writer inference in entity_versions so a later machine
 * version can never silently remove human protection, and so approving an
 * unchanged value still records protection.
 *
 * One row per (entity_type, entity_id, field_name). Re-approval upserts the
 * row back to status 'active'. Release history lives in entity_versions plus
 * the released* columns; this table intentionally stores only current state.
 */
export const fieldModerationState = pgTable(
  "field_moderation_state",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Canonical camelCase field name, matching deltas and field-provenance keys. */
    fieldName: text("field_name").notNull(),

    /** The human-approved value. JSONB so it can hold any field type, including null. */
    approvedValue: jsonb("approved_value"),

    /** 'active' | 'released' */
    status: text("status").notNull().default("active"),

    /**
     * 'moderator' = reviewed and approved by a human moderator
     * 'auto_approved' = trusted-contributor auto-approval path
     */
    verificationType: text("verification_type").notNull(),

    /** FK to the contribution that established this protection. */
    contributionId: text("contribution_id").references(() => contributions.id, { onDelete: "set null" }),

    /** Human moderator who reviewed the change; NULL for auto-approved rows. */
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),

    /** Optional per-field citation override from source_citations. */
    sourceCitationId: text("source_citation_id").references(() => sourceCitations.id, { onDelete: "set null" }),

    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),

    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by").references(() => users.id, { onDelete: "set null" }),
    releaseReason: text("release_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("field_moderation_state_entity_field_unique").on(table.entityType, table.entityId, table.fieldName),
    index("idx_field_moderation_state_entity").on(table.entityType, table.entityId),
    index("idx_field_moderation_state_status").on(table.status),
  ]
);

export type FieldModerationStateSelect = typeof fieldModerationState.$inferSelect;
export type FieldModerationStateInsert = typeof fieldModerationState.$inferInsert;
