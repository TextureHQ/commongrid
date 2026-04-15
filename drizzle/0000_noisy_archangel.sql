CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{"utilities:read"}' NOT NULL,
	"rotation_group" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "balancing_authorities" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"logo" text,
	"eia_code" text,
	"eia_id" text,
	"website" text,
	"states" text[] DEFAULT '{}' NOT NULL,
	"iso_id" text,
	"region_id" text,
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "balancing_authorities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bulk_operations" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "entity_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb,
	"delta" jsonb,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_type" text NOT NULL,
	"change_summary" text,
	CONSTRAINT "entity_versions_entity_type_entity_id_version_number_unique" UNIQUE("entity_type","entity_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "ev_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"station_name" text NOT NULL,
	"street_address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geography" "geography(Point, 4326)",
	"geometry" geometry(Point, 4326),
	"ev_network" text,
	"ev_level1_evse_num" integer DEFAULT 0 NOT NULL,
	"ev_level2_evse_num" integer DEFAULT 0 NOT NULL,
	"ev_dc_fast_num" integer DEFAULT 0 NOT NULL,
	"ev_connector_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_code" text NOT NULL,
	"status_code" text NOT NULL,
	"open_date" text,
	"facility_type" text,
	"owner_type_code" text,
	"ev_pricing" text,
	"search_vector" "tsvector",
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ev_stations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "isos" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"logo" text,
	"website" text,
	"states" text[] DEFAULT '{}' NOT NULL,
	"region_id" text,
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "isos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "power_plants" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plant_code" text NOT NULL,
	"utility_id" text,
	"utility_name" text NOT NULL,
	"balancing_authority_id" text,
	"ba_code" text,
	"state" text NOT NULL,
	"county" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geography" "geography(Point, 4326)",
	"geometry" geometry(Point, 4326),
	"nerc_region" text,
	"sector" text NOT NULL,
	"primary_fuel" text,
	"fuel_category" text NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"energy_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_capacity_mw" double precision NOT NULL,
	"generator_count" integer NOT NULL,
	"operating_year" integer,
	"grid_voltage_kv" double precision,
	"status" text NOT NULL,
	"proposed_capacity_mw" double precision,
	"proposed_online_year" integer,
	"search_vector" "tsvector",
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "power_plants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pricing_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"iso" text NOT NULL,
	"node_type" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geography" "geography(Point, 4326)",
	"geometry" geometry(Point, 4326),
	"zone" text,
	"state" text,
	"voltage_kv" double precision,
	"eia_plant_code" text,
	"source" text NOT NULL,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pricing_nodes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"market_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participation_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incentive_structures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grid_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compensation_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capacity_target" double precision,
	"max_enrollments" integer,
	"program_season" jsonb,
	"launched_at" text,
	"enrollment_opens" text,
	"enrollment_closes" text,
	"ends_at" text,
	"status" text NOT NULL,
	"program_website" text,
	"faq_url" text,
	"terms_url" text,
	"contact_url" text,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"eia_id" text,
	"state" text,
	"customers" integer,
	"source" text,
	"source_url" text,
	"source_date" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "regions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rtos" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"logo" text,
	"website" text,
	"states" text[] DEFAULT '{}' NOT NULL,
	"region_id" text,
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rtos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"geography" "geography(MultiPolygon, 4326)" NOT NULL,
	"geometry" geometry(MultiPolygon, 4326),
	"simplified_1km" geometry(MultiPolygon, 4326),
	"centroid" geometry(Point, 4326),
	"bbox" "box2d",
	"area_sq_km" double precision,
	"vertex_count" integer,
	"source" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmission_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"object_id" integer NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"owner" text NOT NULL,
	"voltage" double precision,
	"volt_class" text NOT NULL,
	"voltage_class" text NOT NULL,
	"sub1" text NOT NULL,
	"sub2" text NOT NULL,
	"length_miles" double precision NOT NULL,
	"naics_code" text NOT NULL,
	"source" text DEFAULT 'HIFLD' NOT NULL,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilities" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"eia_name" text,
	"short_name" text,
	"logo" text,
	"website" text,
	"eia_id" text,
	"segment" text NOT NULL,
	"status" text NOT NULL,
	"customer_count" integer,
	"peak_demand_mw" double precision,
	"winter_peak_demand_mw" double precision,
	"total_revenue_dollars" double precision,
	"total_sales_mwh" double precision,
	"ba_code" text,
	"nerc_region" text,
	"has_generation" boolean,
	"has_transmission" boolean,
	"has_distribution" boolean,
	"ami_meter_count" integer,
	"total_meter_count" integer,
	"jurisdiction" text,
	"iso_id" text,
	"rto_id" text,
	"balancing_authority_id" text,
	"generation_provider_id" text,
	"transmission_provider_id" text,
	"parent_id" text,
	"successor_id" text,
	"service_territory_id" text,
	"notion_page_id" text,
	"search_vector" "tsvector",
	"source" text,
	"source_url" text,
	"submitted_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "utilities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "balancing_authorities" ADD CONSTRAINT "balancing_authorities_iso_id_isos_id_fk" FOREIGN KEY ("iso_id") REFERENCES "public"."isos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balancing_authorities" ADD CONSTRAINT "balancing_authorities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isos" ADD CONSTRAINT "isos_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_plants" ADD CONSTRAINT "power_plants_utility_id_utilities_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."utilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_plants" ADD CONSTRAINT "power_plants_balancing_authority_id_balancing_authorities_id_fk" FOREIGN KEY ("balancing_authority_id") REFERENCES "public"."balancing_authorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtos" ADD CONSTRAINT "rtos_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilities" ADD CONSTRAINT "utilities_iso_id_isos_id_fk" FOREIGN KEY ("iso_id") REFERENCES "public"."isos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilities" ADD CONSTRAINT "utilities_rto_id_rtos_id_fk" FOREIGN KEY ("rto_id") REFERENCES "public"."rtos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilities" ADD CONSTRAINT "utilities_balancing_authority_id_balancing_authorities_id_fk" FOREIGN KEY ("balancing_authority_id") REFERENCES "public"."balancing_authorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilities" ADD CONSTRAINT "utilities_service_territory_id_regions_id_fk" FOREIGN KEY ("service_territory_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_keys_active" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_api_keys_rotation" ON "api_keys" USING btree ("rotation_group");--> statement-breakpoint
CREATE INDEX "idx_bas_slug" ON "balancing_authorities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_bas_eia_code" ON "balancing_authorities" USING btree ("eia_code");--> statement-breakpoint
CREATE INDEX "idx_bas_eia_id" ON "balancing_authorities" USING btree ("eia_id");--> statement-breakpoint
CREATE INDEX "idx_bas_iso_id" ON "balancing_authorities" USING btree ("iso_id");--> statement-breakpoint
CREATE INDEX "idx_bulk_ops_created" ON "bulk_operations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ev_entity" ON "entity_versions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_ev_changed_at" ON "entity_versions" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "idx_ev_change_type" ON "entity_versions" USING btree ("change_type");--> statement-breakpoint
CREATE INDEX "idx_ev_slug" ON "ev_stations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_ev_state" ON "ev_stations" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_ev_network" ON "ev_stations" USING btree ("ev_network");--> statement-breakpoint
CREATE INDEX "idx_ev_access" ON "ev_stations" USING btree ("access_code");--> statement-breakpoint
CREATE INDEX "idx_ev_status" ON "ev_stations" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "idx_isos_slug" ON "isos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_pp_slug" ON "power_plants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_pp_plant_code" ON "power_plants" USING btree ("plant_code");--> statement-breakpoint
CREATE INDEX "idx_pp_utility_id" ON "power_plants" USING btree ("utility_id");--> statement-breakpoint
CREATE INDEX "idx_pp_ba_id" ON "power_plants" USING btree ("balancing_authority_id");--> statement-breakpoint
CREATE INDEX "idx_pp_state" ON "power_plants" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_pp_fuel_category" ON "power_plants" USING btree ("fuel_category");--> statement-breakpoint
CREATE INDEX "idx_pp_status" ON "power_plants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pn_slug" ON "pricing_nodes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_pn_iso" ON "pricing_nodes" USING btree ("iso");--> statement-breakpoint
CREATE INDEX "idx_pn_node_type" ON "pricing_nodes" USING btree ("node_type");--> statement-breakpoint
CREATE INDEX "idx_pn_state" ON "pricing_nodes" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_programs_slug" ON "programs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_programs_status" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_regions_slug" ON "regions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_regions_eia_id" ON "regions" USING btree ("eia_id");--> statement-breakpoint
CREATE INDEX "idx_regions_type" ON "regions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_regions_state" ON "regions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_rtos_slug" ON "rtos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_territories_region_id" ON "territories" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "idx_territories_area" ON "territories" USING btree ("area_sq_km");--> statement-breakpoint
CREATE INDEX "idx_tl_object_id" ON "transmission_lines" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "idx_tl_voltage_class" ON "transmission_lines" USING btree ("voltage_class");--> statement-breakpoint
CREATE INDEX "idx_tl_owner" ON "transmission_lines" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "idx_tl_status" ON "transmission_lines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_utilities_slug" ON "utilities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_utilities_eia_id" ON "utilities" USING btree ("eia_id");--> statement-breakpoint
CREATE INDEX "idx_utilities_segment" ON "utilities" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "idx_utilities_status" ON "utilities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_utilities_iso_id" ON "utilities" USING btree ("iso_id");--> statement-breakpoint
CREATE INDEX "idx_utilities_rto_id" ON "utilities" USING btree ("rto_id");--> statement-breakpoint
CREATE INDEX "idx_utilities_ba_id" ON "utilities" USING btree ("balancing_authority_id");--> statement-breakpoint
CREATE INDEX "idx_utilities_jurisdiction" ON "utilities" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "idx_utilities_parent_id" ON "utilities" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_utilities_service_territory" ON "utilities" USING btree ("service_territory_id");