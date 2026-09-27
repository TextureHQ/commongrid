-- CG-286: additive provenance, with no invented dates or inferred historical sources.
CREATE TABLE "data_sources" (
  "id" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "authority_tier" text NOT NULL,
  "cadence" text NOT NULL,
  "homepage_url" text,
  "license" text,
  "is_active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "data_sources_authority_tier_check" CHECK ("authority_tier" IN ('federal', 'state', 'community', 'derived')),
  CONSTRAINT "data_sources_cadence_check" CHECK ("cadence" IN ('annual', 'monthly', 'irregular', 'on-demand'))
);
--> statement-breakpoint
-- These are discovery/catalog URLs, not a claim that a particular release was
-- downloaded. Dataset-specific license terms must be verified by each adapter;
-- NULL does not grant permission to redistribute.
INSERT INTO "data_sources" ("id", "display_name", "authority_tier", "cadence", "homepage_url") VALUES
  ('eia-861', 'EIA Form 861', 'federal', 'annual', 'https://www.eia.gov/electricity/data/eia861/'),
  ('hifld-rsts', 'HIFLD Retail Service Territories', 'federal', 'irregular', 'https://hifld-geoplatform.hub.arcgis.com/'),
  ('eia-860m', 'EIA Form 860M', 'federal', 'monthly', 'https://www.eia.gov/electricity/data/eia860m/'),
  ('co-puc', 'Colorado Public Utilities Commission', 'state', 'irregular', 'https://puc.colorado.gov/'),
  ('mn-gisdata', 'Minnesota Geospatial Commons', 'state', 'irregular', 'https://gisdata.mn.gov/'),
  ('wi-psc', 'Public Service Commission of Wisconsin', 'state', 'irregular', 'https://psc.wi.gov/'),
  ('manual', 'Manual editorial contribution', 'community', 'on-demand', NULL),
  ('community', 'Community contribution', 'community', 'on-demand', NULL),
  ('derived', 'Derived data', 'derived', 'on-demand', NULL);
--> statement-breakpoint
ALTER TABLE "entity_versions"
  ADD COLUMN "source_id" text REFERENCES "data_sources" ("id") ON DELETE RESTRICT,
  ADD COLUMN "as_of" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "entity_geometry_versions"
  ADD COLUMN "source_id" text REFERENCES "data_sources" ("id") ON DELETE RESTRICT,
  ADD COLUMN "as_of" timestamp with time zone;
