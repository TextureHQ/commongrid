-- Migration: fix commongrid.v_utility_enrichment view + enrichment_schema sidecar (M2)
--
-- Supersedes the earlier drizzle/0007_enrichment_schema_and_view.sql draft.
-- That draft created public.enrichment_schema + public.v_utility_enrichment
-- with non-existent source columns and would have failed to apply; we
-- defensively DROP anything it may have landed in environments where it was
-- partially run, then create the correct commongrid.* objects.
--
-- This migration is fully idempotent (IF NOT EXISTS / OR REPLACE / ON
-- CONFLICT) so it can be re-applied safely.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Clean up partial drafts, if any.
-- ---------------------------------------------------------------------------
DROP VIEW  IF EXISTS public.v_utility_enrichment;
DROP TABLE IF EXISTS public.enrichment_schema;
DROP VIEW  IF EXISTS commongrid.v_utilities_enriched;

-- ---------------------------------------------------------------------------
-- 1. commongrid schema already exists from 0007_commongrid_schema_..., but
--    keep the guard so this migration stands alone in a fresh environment.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS commongrid;

-- ---------------------------------------------------------------------------
-- 2. internal_api_consumer role is created by the earlier schema migration;
--    re-assert the USAGE grant so ordering is robust.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer') THEN
    CREATE ROLE internal_api_consumer NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA commongrid TO internal_api_consumer;

-- ---------------------------------------------------------------------------
-- 3. Enrichment view — stable, versioned contract for internal API consumers.
--    Source of truth is public.utilities joined to territory geometry via
--    regions + territories. Active, non-deleted utilities with an EIA id only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW commongrid.v_utility_enrichment AS
SELECT
  u.eia_id                                              AS eia_utility_id,
  u.slug                                                AS commongrid_utility_slug,
  u.name                                                AS name,
  u.eia_name                                            AS eia_name,
  u.short_name                                          AS dba,
  u.segment                                             AS segment,
  -- NAICS: EIA does not report NAICS codes in Form 860; the utilities table
  -- has no naics column today. Placeholder so the contract is stable; a
  -- future migration can populate this once a source is wired up.
  NULL::text                                            AS naics,
  u.jurisdiction                                        AS state,
  u.website                                             AS website,
  u.domains                                             AS domains,
  u.customer_count                                      AS customer_count_total,
  u.total_meter_count                                   AS total_meters,
  u.ami_meter_count                                     AS ami_meters,
  u.logo                                                AS logo_url,
  -- territory_bbox: ST_Envelope of the service-territory polygon, emitted as
  -- GeoJSON (a Polygon) and cast to jsonb. NULL when no territory geometry
  -- is linked (most utilities today).
  CASE
    WHEN t.geometry IS NOT NULL
      THEN ST_AsGeoJSON(ST_Envelope(t.geometry))::jsonb
    ELSE NULL
  END                                                   AS territory_bbox,
  -- territory_geojson_url: the public /api/v1/territories/{slug}/geometry
  -- endpoint keyed by region (territory) slug, not utility slug.
  CASE
    WHEN r.slug IS NOT NULL
      THEN 'https://commongrid.info/api/v1/territories/' || r.slug || '/geometry'
    ELSE NULL
  END                                                   AS territory_geojson_url,
  u.updated_at                                          AS updated_at
FROM public.utilities u
LEFT JOIN public.regions r
  ON r.id = u.service_territory_id
 AND r.deleted_at IS NULL
LEFT JOIN public.territories t
  ON t.region_id = r.id
 AND t.deleted_at IS NULL
WHERE u.deleted_at IS NULL
  AND u.status = 'ACTIVE'
  AND u.eia_id IS NOT NULL;

COMMENT ON VIEW commongrid.v_utility_enrichment IS
  'Versioned utility enrichment view for internal API consumers. Shape is '
  'documented in commongrid.enrichment_schema. Additive-only: new columns '
  'may be appended with a minor-version bump; removals or renames require a '
  'major-version bump with advance notice.';

-- ---------------------------------------------------------------------------
-- 4. Versioning sidecar. Singleton table that records the current shape and
--    version of v_utility_enrichment so consumers can pin a known contract
--    and fail loud on drift.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commongrid.enrichment_schema (
  id              smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version_major   integer     NOT NULL,
  version_minor   integer     NOT NULL,
  column_manifest jsonb       NOT NULL,
  effective_at    timestamptz NOT NULL DEFAULT now(),
  notes           text
);

COMMENT ON TABLE commongrid.enrichment_schema IS
  'Singleton. Records the current (major, minor) version and column manifest '
  'of commongrid.v_utility_enrichment so internal API consumers can detect drift.';

-- ---------------------------------------------------------------------------
-- 5. Seed / refresh v1.0 manifest. Mirrors the columns and nullability of
--    the view above. Safe to re-run: upserts the single pinned row.
-- ---------------------------------------------------------------------------
INSERT INTO commongrid.enrichment_schema (id, version_major, version_minor, column_manifest, notes)
VALUES (
  1,
  1,
  0,
  '[
    {"name":"eia_utility_id","type":"text","nullable":false},
    {"name":"commongrid_utility_slug","type":"text","nullable":false},
    {"name":"name","type":"text","nullable":false},
    {"name":"eia_name","type":"text","nullable":true},
    {"name":"dba","type":"text","nullable":true},
    {"name":"segment","type":"text","nullable":true},
    {"name":"naics","type":"text","nullable":true},
    {"name":"state","type":"text","nullable":true},
    {"name":"website","type":"text","nullable":true},
    {"name":"domains","type":"text[]","nullable":true},
    {"name":"customer_count_total","type":"integer","nullable":true},
    {"name":"total_meters","type":"integer","nullable":true},
    {"name":"ami_meters","type":"integer","nullable":true},
    {"name":"logo_url","type":"text","nullable":true},
    {"name":"territory_bbox","type":"jsonb","nullable":true},
    {"name":"territory_geojson_url","type":"text","nullable":true},
    {"name":"updated_at","type":"timestamptz","nullable":false}
  ]'::jsonb,
  'v1.0 manifest for commongrid.v_utility_enrichment. Additive changes bump version_minor; breaking changes bump version_major.'
)
ON CONFLICT (id) DO UPDATE
SET version_major   = EXCLUDED.version_major,
    version_minor   = EXCLUDED.version_minor,
    column_manifest = EXCLUDED.column_manifest,
    effective_at    = now(),
    notes           = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- 6. Read-only grants on the two publicly-contracted objects only.
-- ---------------------------------------------------------------------------
GRANT SELECT ON commongrid.v_utility_enrichment TO internal_api_consumer;
GRANT SELECT ON commongrid.enrichment_schema    TO internal_api_consumer;

COMMIT;
