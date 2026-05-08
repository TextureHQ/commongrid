-- Add commongrid schema with enrichment view for internal API consumers.
-- Used by external server-to-server API clients to pull utility enrichment
-- data via a versioned, stable contract. Role internal_api_consumer is
-- scoped read-only and grants only extend to the commongrid schema
-- (not public.utilities directly).

BEGIN;

-- 1. Dedicated namespace for internal API contracts.
CREATE SCHEMA IF NOT EXISTS commongrid;

-- 2. Scoped read-only role (no login). Privileges are GRANTed to this role;
--    actual login users are GRANTed membership in the role below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer') THEN
    CREATE ROLE internal_api_consumer NOLOGIN;
  END IF;
END
$$;

-- 3. Login user that inherits the scoped role.
--    IMPORTANT: the password below is a placeholder. After this migration lands,
--    rotate the password via the Neon console and store the real credential in
--    1Password (Fleet Secrets vault). Do not commit real credentials to this repo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer_user') THEN
    CREATE USER internal_api_consumer_user WITH PASSWORD 'CHANGE_ME_IN_NEON_CONSOLE';
  END IF;
END
$$;

GRANT internal_api_consumer TO internal_api_consumer_user;

-- 4. Allow the role to see objects inside the commongrid schema.
--    No USAGE is granted on public, so raw public.utilities is not readable
--    through this role — only the commongrid.* surface area defined here.
GRANT USAGE ON SCHEMA commongrid TO internal_api_consumer;

-- 5. Enrichment view — stable, versioned contract for internal API consumers.
--    Source of truth is public.utilities. Active, non-deleted rows with an
--    EIA Utility ID only, so the key column is always present.
CREATE OR REPLACE VIEW commongrid.v_utilities_enriched AS
SELECT
  u.eia_id                                  AS eia_utility_id,
  u.id                                      AS commongrid_utility_slug,
  u.name                                    AS name,
  u.eia_name                                AS eia_name,
  u.short_name                              AS dba,
  u.segment                                 AS segment,
  NULL::text                                AS naics,
  u.jurisdiction                            AS state,
  u.website                                 AS website,
  u.domains                                 AS domains,
  u.customer_count                          AS customer_count_total,
  u.total_meter_count                       AS total_meters,
  u.ami_meter_count                         AS ami_meters,
  u.logo                                    AS logo_url,
  NULL::jsonb                               AS territory_bbox,
  CASE
    WHEN u.eia_id IS NOT NULL
      THEN 'https://commongrid.info/api/utilities/' || u.eia_id || '/territory.geojson'
    ELSE NULL
  END                                       AS territory_geojson_url,
  u.updated_at                              AS updated_at
FROM public.utilities u
WHERE u.deleted_at IS NULL
  AND u.status = 'ACTIVE'
  AND u.eia_id IS NOT NULL;

COMMENT ON VIEW commongrid.v_utilities_enriched IS
  'Versioned utility enrichment view for internal API consumers. Shape is documented in commongrid.enrichment_schema. Additive-only: new columns may be appended with a minor-version bump; removals or renames require a major-version bump with advance notice.';

-- 6. Versioning sidecar. Singleton table (one row) that records the current
--    shape and version of v_utilities_enriched. Consumers pin to a known
--    major version and fail loud on a mismatch.
CREATE TABLE IF NOT EXISTS commongrid.enrichment_schema (
  id              smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version_major   integer     NOT NULL,
  version_minor   integer     NOT NULL,
  column_manifest jsonb       NOT NULL,
  effective_at    timestamptz NOT NULL DEFAULT now(),
  notes           text
);

COMMENT ON TABLE commongrid.enrichment_schema IS
  'Singleton. Records the current (major, minor) version and column manifest of commongrid.v_utilities_enriched so internal API consumers can detect drift.';

-- 7. Seed v1.0 manifest. Mirrors the columns and nullability of the view above.
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
  'Initial v1.0 manifest. Additive changes bump version_minor; breaking changes bump version_major.'
)
ON CONFLICT (id) DO NOTHING;

-- 8. Read-only grants on the two publicly-contracted objects only.
GRANT SELECT ON commongrid.v_utilities_enriched TO internal_api_consumer;
GRANT SELECT ON commongrid.enrichment_schema   TO internal_api_consumer;

COMMIT;
