-- Migration: Add substations table
-- Created: 2026-05-05
-- Purpose: Introduce substations as the 9th CommonGrid entity type.
-- Research: memory/specs/ninth-entry-point-research.md
--
-- Scope: just the schema. No data sync (that's PR #2: meridian/substations-sync).
--
-- Conventions mirror power_plants and ev_stations:
--   - text primary key
--   - doublePrecision lat/lng + nullable geography/geometry columns
--   - soft-delete audit block (created_at, updated_at, deleted_at, version)
--   - tsvector search_vector column (populated by the sync script)
--   - spatial / full-text / trigram indexes created here
--
-- NOTE on drizzle snapshot drift: running `drizzle-kit generate` against main
-- surfaced `knock_delivery_log` and the `notifications.knock_*` columns as
-- "new", because those landed in production via a manual DDL change that
-- was never captured in a drizzle migration. That drift is pre-existing and
-- intentionally NOT included here — fixing it is out of scope for this PR
-- and will be addressed in a separate, dedicated "schema sync" PR.

CREATE TABLE "substations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"owner_name" text,
	"owner_utility_id" text,
	"state" text NOT NULL,
	"county" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geography" geography(Point, 4326),
	"geometry" geometry(Point, 4326),
	"min_voltage_kv" integer,
	"max_voltage_kv" integer,
	"substation_type" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"eia_id" text,
	"osm_id" text,
	"hifld_legacy_id" text,
	"search_vector" tsvector,
	"locked_status" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "substations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

ALTER TABLE "substations"
	ADD CONSTRAINT "substations_owner_utility_id_utilities_id_fk"
	FOREIGN KEY ("owner_utility_id") REFERENCES "public"."utilities"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Btree filter indexes (mirrored in lib/db/schema/substations.ts)
CREATE INDEX "idx_sub_slug" ON "substations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_sub_owner_utility_id" ON "substations" USING btree ("owner_utility_id");--> statement-breakpoint
CREATE INDEX "idx_sub_state" ON "substations" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_sub_substation_type" ON "substations" USING btree ("substation_type");--> statement-breakpoint
CREATE INDEX "idx_sub_status" ON "substations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sub_source" ON "substations" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_sub_eia_id" ON "substations" USING btree ("eia_id");--> statement-breakpoint
CREATE INDEX "idx_sub_osm_id" ON "substations" USING btree ("osm_id");--> statement-breakpoint

-- Spatial indexes (mirrors the pattern from drizzle/0001_add_performance_indexes.sql)
CREATE INDEX "idx_sub_geography" ON "substations" USING GIST(geography);--> statement-breakpoint
CREATE INDEX "idx_sub_geography_nd" ON "substations" USING SPGIST(geography);--> statement-breakpoint
CREATE INDEX "idx_sub_geometry" ON "substations" USING GIST(geometry);--> statement-breakpoint

-- Full-text search + trigram indexes (pg_trgm is enabled globally by 0001_add_performance_indexes.sql)
CREATE INDEX "idx_sub_search" ON "substations" USING GIN(search_vector);--> statement-breakpoint
CREATE INDEX "idx_sub_name_trgm" ON "substations" USING GIN(name gin_trgm_ops);
