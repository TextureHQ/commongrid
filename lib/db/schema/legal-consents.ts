import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Privacy-minimal evidence of explicit assent to the hosted-service policies. */
export const legalConsents = pgTable(
  "legal_consents",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** SHA-256 of a domain-separated user ID or random browser ID. Never a raw IP. */
    subjectHash: text("subject_hash").notNull(),
    termsVersion: text("terms_version").notNull(),
    acceptableUseVersion: text("acceptable_use_version").notNull(),
    termsPath: text("terms_path").notNull(),
    acceptableUsePath: text("acceptable_use_path").notNull(),
    privacyPath: text("privacy_path").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("legal_consents_subject_policy_unique").on(
      table.subjectHash,
      table.termsVersion,
      table.acceptableUseVersion
    ),
    index("idx_legal_consents_user").on(table.userId),
    index("idx_legal_consents_accepted_at").on(table.acceptedAt),
  ]
);

export type LegalConsentSelect = typeof legalConsents.$inferSelect;
export type LegalConsentInsert = typeof legalConsents.$inferInsert;
