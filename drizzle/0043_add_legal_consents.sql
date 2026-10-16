-- Privacy-minimal, versioned evidence of explicit assent to CommonGrid's
-- hosted-service Terms and Acceptable Use Policy. Deliberately excludes raw IP,
-- user-agent, location, and other request metadata.

CREATE TABLE IF NOT EXISTS "legal_consents" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text,
  "subject_hash" text NOT NULL,
  "terms_version" text NOT NULL,
  "acceptable_use_version" text NOT NULL,
  "terms_path" text NOT NULL,
  "acceptable_use_path" text NOT NULL,
  "privacy_path" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_consents_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_consents_subject_policy_unique"
  ON "legal_consents" USING btree ("subject_hash", "terms_version", "acceptable_use_version");
CREATE INDEX IF NOT EXISTS "idx_legal_consents_user" ON "legal_consents" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_legal_consents_accepted_at" ON "legal_consents" USING btree ("accepted_at");
