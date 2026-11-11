-- Record confirmations: "this is still right," as its own dated event.
--
-- One row per field someone at a utility confirmed. Never changes the record.
-- Separate from field_moderation_state on purpose: a row there locks the
-- field against automated sync. No grant for the commongrid_sync role: syncs
-- never read or write this table.

CREATE TABLE IF NOT EXISTS "record_confirmations" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "utility_id" text NOT NULL,
  "field_name" text NOT NULL,
  "confirmed_value" jsonb,
  "user_id" text,
  "email_domain" text NOT NULL,
  "submission_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "record_confirmations_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_record_confirmations_entity"
  ON "record_confirmations" USING btree ("entity_type", "entity_id", "field_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_record_confirmations_utility"
  ON "record_confirmations" USING btree ("utility_id");
