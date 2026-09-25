-- Public tariff catalog. Each URDB label is an upstream schedule identity;
-- amendments are retained by entity_versions, not overwritten without history.
CREATE TABLE "tariffs" (
  "id" text PRIMARY KEY,
  "upstream_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "utility_id" text REFERENCES "utilities"("id") ON DELETE SET NULL,
  "utility_name" text NOT NULL,
  "eia_id" text,
  "match_status" text NOT NULL CHECK (match_status IN ('matched', 'unmatched', 'ambiguous', 'missingEia')),
  "sector" text,
  "service_type" text,
  "effective_from" text,
  "effective_to" text,
  "supersedes" text,
  "source_id" text NOT NULL REFERENCES "data_sources"("id"),
  "source_url" text NOT NULL,
  "attribution" jsonb NOT NULL,
  "raw_record" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX "idx_tariffs_utility_id" ON "tariffs" ("utility_id");
CREATE INDEX "idx_tariffs_eia_id" ON "tariffs" ("eia_id");
CREATE INDEX "idx_tariffs_sector" ON "tariffs" ("sector");
--> statement-breakpoint
INSERT INTO data_sources (id, display_name, authority_tier, cadence, homepage_url, license, is_active)
VALUES ('openei-urdb', 'OpenEI Utility Rate Database (URDB)', 'federal', 'irregular',
        'https://data.openei.org/submissions/5', 'CC-BY-4.0', true)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Existing IaC-managed role. No credentials or roles provisioned by this migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON public.tariffs TO commongrid_sync;
  END IF;
END $$;
