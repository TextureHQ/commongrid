import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Record Confirmations — "this is still right," as its own dated event
 *
 * One row per field someone at a utility confirmed is still accurate: the
 * utility's website, a co-op's power supplier, or a program still running as
 * listed. A confirmation never changes the record.
 *
 * Only written when the person's verified sign-in email matches one of the
 * utility's domains, so there is nothing to review. Shown publicly as
 * "Confirmed by <utility name> · <date>"; who confirmed it is kept here for
 * maintainers, not displayed.
 *
 * Append-only. A confirmation applies while the field still holds
 * `confirmed_value`; once the value changes, it stops applying. That is worked
 * out when reading, so nothing here needs updating.
 *
 * Why not `field_moderation_state`: an active row there locks the field
 * against automated sync (see getModerationLockedFields in apply-sync), and
 * that table keeps one row per field, so a confirmation would overwrite the
 * moderator approval it points to. Confirming must do neither.
 */
export const recordConfirmations = pgTable(
  "record_confirmations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    /** 'utility' | 'program' */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** The utility that confirmed it. For a program, the utility that runs it. */
    utilityId: text("utility_id").notNull(),

    /** Canonical camelCase field name: 'website', 'generationProviderId', or 'status' for a program. */
    fieldName: text("field_name").notNull(),
    /** The value the person saw and confirmed. JSONB so it can hold any field type. */
    confirmedValue: jsonb("confirmed_value"),

    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Domain of the verified sign-in email that matched the utility, e.g. '4county.org'. */
    emailDomain: text("email_domain").notNull(),

    /** Groups the fields confirmed together in one go. */
    submissionId: text("submission_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_record_confirmations_entity").on(table.entityType, table.entityId, table.fieldName),
    index("idx_record_confirmations_utility").on(table.utilityId),
  ]
);

export type RecordConfirmationSelect = typeof recordConfirmations.$inferSelect;
export type RecordConfirmationInsert = typeof recordConfirmations.$inferInsert;
