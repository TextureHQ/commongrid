-- Migration: Add users and user_notification_prefs tables for Clerk auth integration
-- ERD Reference: §3.1 users, §3.2 user_notification_prefs
-- Phase 1: Auth & User Infrastructure

CREATE TABLE "users" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_user_id" text NOT NULL,
  "display_name" text NOT NULL,
  "email" text,
  "avatar_url" text,
  "affiliation" text,
  "bio" text,
  "role" text DEFAULT 'contributor' NOT NULL,
  "contribution_count" integer DEFAULT 0 NOT NULL,
  "approved_count" integer DEFAULT 0 NOT NULL,
  "returned_count" integer DEFAULT 0 NOT NULL,
  "entity_types_edited" text[] DEFAULT '{}' NOT NULL,
  "contribution_stats_by_type" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trusted_promoted_at" timestamp with time zone,
  "trusted_promoted_by" text,
  "banned_at" timestamp with time zone,
  "banned_until" timestamp with time zone,
  "ban_reason" text,
  "warning_count" integer DEFAULT 0 NOT NULL,
  "mod_preferred_entity_types" text[],
  "mod_preferred_regions" text[],
  "mod_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_active_at" timestamp with time zone,
  CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_notification_prefs" (
  "user_id" text PRIMARY KEY NOT NULL,
  "contribution_status_delivery" text DEFAULT 'email_immediate' NOT NULL,
  "followed_changes_delivery" text DEFAULT 'email_daily' NOT NULL,
  "discussion_activity_delivery" text DEFAULT 'in_app' NOT NULL,
  "appeal_resolved_delivery" text DEFAULT 'email_immediate' NOT NULL,
  "email_paused" boolean DEFAULT false NOT NULL,
  "digest_hour" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_notification_prefs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "idx_users_clerk_id" ON "users" USING btree ("clerk_user_id");
--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");
--> statement-breakpoint
CREATE INDEX "idx_users_created" ON "users" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "idx_users_banned" ON "users" USING btree ("banned_at") WHERE "banned_at" IS NOT NULL;

-- Also add new columns to entity_versions for community contribution provenance (ERD §4.2)
--> statement-breakpoint
ALTER TABLE "entity_versions" ADD COLUMN "contribution_id" text;
--> statement-breakpoint
ALTER TABLE "entity_versions" ADD COLUMN "source_type" text;
