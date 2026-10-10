-- CG-365: Durable per-field moderation-state ledger.
--
-- Adds field_moderation_state as a hard protection layer above the last-writer
-- inference in entity_versions. Active rows protect human-approved values from
-- being overwritten by automated sync; released rows allow sync to resume.
-- One row per (entity_type, entity_id, field_name); re-approval upserts back
-- to active. Release history lives in entity_versions plus the released_*
-- columns here.

CREATE TABLE IF NOT EXISTS "field_moderation_state" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "field_name" text NOT NULL,
  "approved_value" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "verification_type" text NOT NULL,
  "contribution_id" text,
  "reviewed_by" text,
  "source_citation_id" text,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "released_by" text,
  "release_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "field_moderation_state_contribution_id_fk"
    FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE SET NULL,
  CONSTRAINT "field_moderation_state_reviewed_by_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "field_moderation_state_released_by_fk"
    FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "field_moderation_state_source_citation_id_fk"
    FOREIGN KEY ("source_citation_id") REFERENCES "public"."source_citations"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "field_moderation_state_entity_field_unique"
  ON "field_moderation_state" USING btree ("entity_type", "entity_id", "field_name");

CREATE INDEX IF NOT EXISTS "idx_field_moderation_state_entity"
  ON "field_moderation_state" USING btree ("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "idx_field_moderation_state_status"
  ON "field_moderation_state" USING btree ("status");
