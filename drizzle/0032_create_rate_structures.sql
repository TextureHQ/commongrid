-- CG-310: Rates & Tariffs V1 — published rate structures backed by OpenEI URDB.
--
-- Creates the rate_structures table, registers the URDB upstream source in
-- data_sources (required because entity_versions.source_id is a FK), and grants
-- the commongrid_sync role the privileges it needs to run the weekly sync.

-- 1. Table: published utility rate schedules.
CREATE TABLE IF NOT EXISTS "rate_structures" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "eia_id" integer,
  "utility_id" text,
  "region_id" text,
  "utility_name" text,
  "sector" text,
  "service_type" text,
  "description" text,
  "fixed_charge" numeric,
  "fixed_charge_units" text,
  "energy_rate_structure" jsonb,
  "energy_weekday_schedule" jsonb,
  "energy_weekend_schedule" jsonb,
  "demand_rate_structure" jsonb,
  "flat_demand_structure" jsonb,
  "demand_rate_unit" text,
  "net_metering_rules" jsonb,
  "has_tou" boolean DEFAULT false NOT NULL,
  "has_demand_charge" boolean DEFAULT false NOT NULL,
  "has_net_metering" boolean DEFAULT false NOT NULL,
  "is_ev_rate" boolean DEFAULT false NOT NULL,
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone,
  "approved" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "source" text,
  "source_url" text,
  "source_parent_url" text,
  "source_date" timestamp with time zone,
  "locked_status" text,
  "submitted_by" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL
);

-- 2. Indexes for the query patterns the explorer/API will use.
CREATE INDEX IF NOT EXISTS "idx_rate_structures_slug" ON "rate_structures" ("slug");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_eia_id" ON "rate_structures" ("eia_id");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_utility_id" ON "rate_structures" ("utility_id");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_region_id" ON "rate_structures" ("region_id");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_sector" ON "rate_structures" ("sector");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_has_tou" ON "rate_structures" ("has_tou");
CREATE INDEX IF NOT EXISTS "idx_rate_structures_is_ev_rate" ON "rate_structures" ("is_ev_rate");

-- 3. Register the upstream source. entity_versions.source_id is a FK, so a
--    SyncRecord.sourceId of 'urdb' cannot write a version until this row exists.
--    URDB is DOE/NREL-maintained and CC0 "unless otherwise noted".
INSERT INTO "data_sources" ("id", "display_name", "authority_tier", "cadence", "homepage_url", "license") VALUES
  ('urdb', 'OpenEI Utility Rate Database', 'federal', 'irregular', 'https://openei.org/wiki/Utility_Rate_Database', 'CC0')
ON CONFLICT ("id") DO NOTHING;

-- 4. Grant commongrid_sync the minimum privileges needed by applySync.
--    Idempotent and guarded on the role's existence so local dev / fresh CI
--    databases where the role does not exist are unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON public.rate_structures TO commongrid_sync;
  END IF;
END $$;
