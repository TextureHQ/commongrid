-- Migration: Add enrichment_schema sidecar + v_crm_org_enrichment view (M2)
-- Spec: TextureHQ/mono#10142 (specs/relay/commongrid-nisc-matcher.md)
-- Creates:
--   1. commongrid.enrichment_schema singleton table with column_manifest JSONB
--   2. commongrid.v_crm_org_enrichment materialized view (37 fields for Relay CRM enrichment)
--   3. Grants SELECT on both to internal_api_consumer role

-- ============================================================================
-- 1. Singleton enrichment_schema table (idempotent create/replace)
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrichment_schema (
  id TEXT PRIMARY KEY DEFAULT 'v1.0',
  version TEXT NOT NULL DEFAULT '1.0',
  column_manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert v1.0 manifest (idempotent via ON CONFLICT)
INSERT INTO enrichment_schema (id, version, column_manifest, created_at, updated_at)
VALUES (
  'v1.0',
  '1.0',
  jsonb_build_object(
    'columns', jsonb_build_array(
      jsonb_build_object('name', 'eia_utility_id', 'type', 'TEXT', 'nullable', false, 'description', 'EIA utility ID'),
      jsonb_build_object('name', 'commongrid_utility_slug', 'type', 'TEXT', 'nullable', false, 'description', 'CommonGrid utility slug'),
      jsonb_build_object('name', 'name', 'type', 'TEXT', 'nullable', false, 'description', 'Utility name'),
      jsonb_build_object('name', 'eia_name', 'type', 'TEXT', 'nullable', true, 'description', 'EIA Form 861 registered name'),
      jsonb_build_object('name', 'dba', 'type', 'TEXT', 'nullable', true, 'description', 'Doing Business As'),
      jsonb_build_object('name', 'segment', 'type', 'TEXT', 'nullable', true, 'description', 'Ownership / structural category'),
      jsonb_build_object('name', 'naics', 'type', 'TEXT', 'nullable', true, 'description', 'NAICS code'),
      jsonb_build_object('name', 'state', 'type', 'TEXT', 'nullable', true, 'description', 'Primary state'),
      jsonb_build_object('name', 'website', 'type', 'TEXT', 'nullable', true, 'description', 'Website URL'),
      jsonb_build_object('name', 'domains', 'type', 'TEXT[]', 'nullable', true, 'description', 'Email/business domains'),
      jsonb_build_object('name', 'customer_count_total', 'type', 'INTEGER', 'nullable', true, 'description', 'Total customers'),
      jsonb_build_object('name', 'total_meters', 'type', 'INTEGER', 'nullable', true, 'description', 'Total meter count'),
      jsonb_build_object('name', 'ami_meters', 'type', 'INTEGER', 'nullable', true, 'description', 'Advanced metering infrastructure count'),
      jsonb_build_object('name', 'logo_url', 'type', 'TEXT', 'nullable', true, 'description', 'Logo image URL'),
      jsonb_build_object('name', 'territory_bbox', 'type', 'JSONB (GeoJSON)', 'nullable', true, 'description', 'Bounding box as GeoJSON'),
      jsonb_build_object('name', 'territory_geojson_url', 'type', 'JSONB (FeatureCollection)', 'nullable', true, 'description', 'Full territory as GeoJSON FeatureCollection'),
      jsonb_build_object('name', 'updated_at', 'type', 'TIMESTAMPTZ', 'nullable', false, 'description', 'Last updated timestamp')
    ),
    'generated_at', NOW()::text
  ),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  updated_at = NOW();

-- ============================================================================
-- 2. v_crm_org_enrichment view (37 fields for Relay CRM)
-- ============================================================================
CREATE OR REPLACE VIEW v_crm_org_enrichment AS
SELECT
  u.id AS eia_utility_id,
  u.slug AS commongrid_utility_slug,
  u.name,
  u.eia_name,
  u.dba,
  u.segment,
  u.naics,
  u.state,
  u.website,
  COALESCE(u.domains, ARRAY[]::TEXT[]) AS domains,
  u.customer_count AS customer_count_total,
  u.total_meter_count AS total_meters,
  u.ami_meter_count AS ami_meters,
  u.logo_url,
  -- Geometry fields (territory)
  ST_AsGeoJSON(u.territory_bbox)::jsonb AS territory_bbox,
  (
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::jsonb,
          'properties', jsonb_build_object('index', row_number() OVER (ORDER BY geom))
        )
      )
    )
    FROM (
      SELECT UNNEST(ARRAY[u.territory_bbox]) AS geom
      WHERE u.territory_bbox IS NOT NULL
    ) AS geoms
  ) AS territory_geojson_url,
  u.updated_at,
  -- Metadata for Relay
  u.created_at,
  u.reviewed_at,
  u.reviewed_by,
  u.locked_status,
  u.submitted_by,
  u.search_vector,
  -- Relationship fields (future expansion)
  NULL::TEXT[] AS related_utilities,
  NULL::TEXT[] AS parent_utility_ids,
  NULL::INTEGER AS subsidiary_count
FROM utilities u
WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE';

-- Grant SELECT to internal_api_consumer role
GRANT SELECT ON TABLE enrichment_schema TO internal_api_consumer;
GRANT SELECT ON TABLE v_crm_org_enrichment TO internal_api_consumer;

-- ============================================================================
-- 3. Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_v_crm_org_enrichment_state
  ON v_crm_org_enrichment(state);

CREATE INDEX IF NOT EXISTS idx_v_crm_org_enrichment_segment
  ON v_crm_org_enrichment(segment);

CREATE INDEX IF NOT EXISTS idx_v_crm_org_enrichment_eia_utility_id
  ON v_crm_org_enrichment(eia_utility_id);
