ALTER TABLE "community_editable_fields" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "community_editable_fields" ADD COLUMN "precision" integer;--> statement-breakpoint
ALTER TABLE "community_editable_fields" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "community_editable_fields" ADD COLUMN "min_value" numeric;--> statement-breakpoint
ALTER TABLE "community_editable_fields" ADD COLUMN "max_value" numeric;--> statement-breakpoint
ALTER TABLE "community_editable_fields" ADD COLUMN "enum_source" text;