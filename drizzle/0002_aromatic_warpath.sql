ALTER TABLE "balancing_authorities" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "change_type" text;--> statement-breakpoint
ALTER TABLE "ev_stations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "isos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "power_plants" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pricing_nodes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rtos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "territories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transmission_lines" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "section";--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "precision";--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "unit";--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "min_value";--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "max_value";--> statement-breakpoint
ALTER TABLE "community_editable_fields" DROP COLUMN "enum_source";