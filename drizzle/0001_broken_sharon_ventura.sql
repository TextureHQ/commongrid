CREATE TABLE "api_usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"api_key_id" text,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_time_ms" integer NOT NULL,
	"is_authenticated" boolean DEFAULT false NOT NULL,
	"tier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changesets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"contribution_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_editable_fields" (
	"entity_type" text NOT NULL,
	"field_name" text NOT NULL,
	"field_type" text NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"validation_rules" jsonb,
	CONSTRAINT "community_editable_fields_entity_type_field_name_pk" PRIMARY KEY("entity_type","field_name")
);
--> statement-breakpoint
CREATE TABLE "contribution_appeals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" text NOT NULL,
	"user_id" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'under_review' NOT NULL,
	"assigned_to" text,
	"resolved_by" text,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"changeset_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_version" integer NOT NULL,
	"entity_slug" text NOT NULL,
	"entity_state" text,
	"changes" jsonb NOT NULL,
	"geometry_change_type" text,
	"geometry_before" "geography",
	"geometry_after" "geography",
	"geometry_validation" jsonb,
	"edit_summary" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"source_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"auto_flagged" boolean DEFAULT false NOT NULL,
	"flag_reasons" text[],
	"auto_approved" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"moderator_comment" text,
	"applied_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_posts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text,
	"reply_to_id" text,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_threads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"closed_by" text,
	"post_count" integer DEFAULT 0 NOT NULL,
	"last_post_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entity_follows" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"notify_all_changes" boolean DEFAULT true NOT NULL,
	"notify_discussions" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_follows_unique" UNIQUE("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_geometry_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"geography_snapshot" "geography",
	"geometry_snapshot" geometry,
	"geometry_type" text,
	"area_sq_km" double precision,
	"centroid_lat" double precision,
	"centroid_lng" double precision,
	"entity_version_id" bigint,
	"contribution_id" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_geometry_versions_entity_type_entity_id_version_number_unique" UNIQUE("entity_type","entity_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "entity_locks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"lock_level" text NOT NULL,
	"reason" text,
	"locked_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "entity_locks_entity_unique" UNIQUE("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderator_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"comment" text,
	"internal_note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_response_templates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"response_text" text NOT NULL,
	"category" text NOT NULL,
	"created_by" text,
	"is_global" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"email_type" text,
	"email_status" text DEFAULT 'pending',
	"email_sent_at" timestamp with time zone,
	"email_service_id" text,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_citations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" text NOT NULL,
	"field_name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"source_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_source_citations_unique" UNIQUE("contribution_id","field_name")
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "api_keys" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "tier" text DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "app_name" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "app_url" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "use_case" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_used_endpoint" text;--> statement-breakpoint
ALTER TABLE "balancing_authorities" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD COLUMN "contribution_id" text;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "ev_stations" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "isos" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "power_plants" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "pricing_nodes" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "rtos" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "transmission_lines" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN "locked_status" text;--> statement-breakpoint
ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_appeals" ADD CONSTRAINT "contribution_appeals_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_appeals" ADD CONSTRAINT "contribution_appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_appeals" ADD CONSTRAINT "contribution_appeals_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_appeals" ADD CONSTRAINT "contribution_appeals_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_changeset_id_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."changesets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_reply_to_id_discussion_posts_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_follows" ADD CONSTRAINT "entity_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_geometry_versions" ADD CONSTRAINT "entity_geometry_versions_entity_version_id_entity_versions_id_fk" FOREIGN KEY ("entity_version_id") REFERENCES "public"."entity_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_geometry_versions" ADD CONSTRAINT "entity_geometry_versions_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_locks" ADD CONSTRAINT "entity_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_response_templates" ADD CONSTRAINT "moderation_response_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_citations" ADD CONSTRAINT "source_citations_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_prefs" ADD CONSTRAINT "user_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_usage_api_key" ON "api_usage_events" USING btree ("api_key_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_endpoint" ON "api_usage_events" USING btree ("endpoint","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_created" ON "api_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_status" ON "api_usage_events" USING btree ("status_code","created_at");--> statement-breakpoint
CREATE INDEX "idx_changesets_user" ON "changesets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_changesets_status" ON "changesets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_appeals_contribution" ON "contribution_appeals" USING btree ("contribution_id");--> statement-breakpoint
CREATE INDEX "idx_appeals_status" ON "contribution_appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contributions_user" ON "contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_contributions_entity" ON "contributions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_contributions_status" ON "contributions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contributions_changeset" ON "contributions" USING btree ("changeset_id");--> statement-breakpoint
CREATE INDEX "idx_contributions_created" ON "contributions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_thread" ON "discussion_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_user" ON "discussion_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_threads_entity" ON "discussion_threads" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_threads_status" ON "discussion_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_threads_last_post" ON "discussion_threads" USING btree ("last_post_at");--> statement-breakpoint
CREATE INDEX "idx_follows_user" ON "entity_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_follows_entity" ON "entity_follows" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_egv_entity" ON "entity_geometry_versions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_egv_version" ON "entity_geometry_versions" USING btree ("entity_version_id");--> statement-breakpoint
CREATE INDEX "idx_entity_locks_level" ON "entity_locks" USING btree ("lock_level");--> statement-breakpoint
CREATE INDEX "idx_mod_actions_moderator" ON "moderation_actions" USING btree ("moderator_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mod_actions_target" ON "moderation_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_mod_actions_type" ON "moderation_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_mod_actions_created" ON "moderation_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mod_templates_category" ON "moderation_response_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_source_citations_contribution" ON "source_citations" USING btree ("contribution_id");--> statement-breakpoint
CREATE INDEX "idx_users_clerk_id" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_created" ON "users" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_versions" ADD CONSTRAINT "entity_versions_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_tier" ON "api_keys" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "idx_ev_source_type" ON "entity_versions" USING btree ("source_type");