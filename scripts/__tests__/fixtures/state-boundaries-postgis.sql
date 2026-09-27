-- Disposable integration fixture: only columns exercised by the publisher,
-- modeling the missing spatial-history constraint seen in older databases.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE ROLE commongrid_sync NOLOGIN;
CREATE TABLE data_sources (id text PRIMARY KEY, display_name text NOT NULL, authority_tier text NOT NULL, cadence text NOT NULL, homepage_url text, license text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE utilities (eia_id text PRIMARY KEY, jurisdiction text, service_territory_id text, deleted_at timestamptz);
CREATE TABLE regions (
 id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, type text NOT NULL,
 eia_id text, state text, customers integer, locked_status text, source text, source_url text,
 source_date text, submitted_by text, reviewed_at timestamptz, reviewed_by text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz, version integer NOT NULL DEFAULT 1
);
CREATE TABLE territories (
 id text PRIMARY KEY, region_id text NOT NULL REFERENCES regions(id), geography geography(MultiPolygon,4326) NOT NULL,
 geometry geometry(MultiPolygon,4326) GENERATED ALWAYS AS (geography::geometry) STORED,
 simplified_1km geometry(MultiPolygon,4326) GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geography::geometry, 0.01)) STORED,
 centroid geometry(Point,4326) GENERATED ALWAYS AS (ST_Centroid(geography::geometry)) STORED,
 bbox box2d GENERATED ALWAYS AS (Box2D(geography::geometry)) STORED,
 area_sq_km double precision GENERATED ALWAYS AS (ST_Area(geography) / 1e6) STORED,
 vertex_count integer GENERATED ALWAYS AS (ST_NPoints(geography::geometry)) STORED,
 source text, source_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz, version integer NOT NULL DEFAULT 1
);
CREATE TABLE change_batches (
 id text PRIMARY KEY DEFAULT gen_random_uuid(), source_type text NOT NULL, title text NOT NULL,
 description text, initiated_by text, version_count integer NOT NULL DEFAULT 0,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE entity_versions (
 id bigserial PRIMARY KEY, entity_type text NOT NULL, entity_id text NOT NULL, version_number integer NOT NULL,
 snapshot jsonb, delta jsonb, source_id text REFERENCES data_sources(id), as_of timestamptz,
 changed_by text, changed_at timestamptz NOT NULL DEFAULT now(), change_type text NOT NULL,
 change_summary text, contribution_id text, source_type text, batch_id text REFERENCES change_batches(id),
 entity_name text, entity_slug text, UNIQUE(entity_type,entity_id,version_number),
 CHECK ((snapshot IS NOT NULL AND delta IS NULL) OR (snapshot IS NULL AND delta IS NOT NULL))
);
CREATE TABLE entity_geometry_versions (
 id bigserial PRIMARY KEY, entity_type text NOT NULL, entity_id text NOT NULL, version_number integer NOT NULL,
 geography_snapshot geography, geometry_snapshot geometry, geometry_type text, area_sq_km double precision,
 centroid_lat double precision, centroid_lng double precision, entity_version_id bigint REFERENCES entity_versions(id),
 contribution_id text, source_id text REFERENCES data_sources(id), as_of timestamptz,
 changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA public TO commongrid_sync;
GRANT SELECT ON data_sources, utilities TO commongrid_sync;
GRANT SELECT, INSERT, UPDATE ON regions, territories, entity_versions, change_batches TO commongrid_sync;
GRANT USAGE, SELECT ON SEQUENCE entity_versions_id_seq TO commongrid_sync;
-- Spatial grants intentionally omitted: migration 0036 must supply them.
