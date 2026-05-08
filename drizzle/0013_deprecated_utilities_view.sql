-- Migration: public.v_deprecated_utilities — utility lifecycle view
--
-- Purpose
-- -------
-- Surface historical utility identity in a stable, consumer-friendly shape so
-- any researcher, journalist, or downstream ETL can reconcile a legacy
-- utility name (or legacy EIA id) back to whatever entity replaced it.
--
-- The `utilities` table already carries everything we need — `status`,
-- `successor_id`, `deprecation_reason`, timestamps — but those columns are
-- scattered and the enum values (`ACTIVE`, `MERGED`, `ACQUIRED`, `DEFUNCT`,
-- `PENDING`) are not the labels a consumer usually wants. This view
-- normalises that information into a single row per historical / current
-- utility with a small, stable schema:
--
--   eia_id              — canonical utility id (the row's `public.utilities.id`)
--   utility_slug        — stable public slug on commongrid.info
--   name                — display name at time of the most recent update
--   status              — one of: active | retired | merged | renamed
--   raw_status          — the underlying enum value verbatim (useful for debug)
--   effective_from      — when the record first entered the dataset
--   effective_to        — when the record was deprecated (NULL for active)
--   successor_eia_id    — id of the utility that replaced it, if known
--   successor_slug      — slug of successor (convenience for API consumers)
--   source              — "EIA-861 + manual overrides" for the baseline
--   deprecation_reason  — free-form human note, nullable
--   notes               — alias of deprecation_reason kept so the view shape
--                         matches the M10 spec ("notes") even if we later
--                         rename the underlying column
--
-- Status mapping
-- --------------
--   ACTIVE   -> 'active'   (effective_to NULL)
--   DEFUNCT  -> 'retired'
--   MERGED   -> 'merged'
--   ACQUIRED -> 'merged'   (acquisition is a merge from the consumer's POV)
--   PENDING  -> 'active'   (still being reviewed; not yet deprecated)
-- Rows with a non-NULL successor_id whose underlying status would otherwise
-- be `retired` are re-labelled `renamed` so "renamed" is reachable without
-- introducing a new enum value in `utilities.status`.
--
-- Idempotent
-- ----------
-- Re-running this migration is safe: CREATE OR REPLACE VIEW preserves
-- permissions and any GRANTs from prior applications.
--
-- Deploy
-- ------
-- CommonGrid CI does NOT auto-apply migrations. A maintainer applies this
-- against the Neon database manually after merge.

BEGIN;

CREATE OR REPLACE VIEW public.v_deprecated_utilities AS
SELECT
  u.id                                                        AS eia_id,
  u.slug                                                      AS utility_slug,
  u.name                                                      AS name,
  CASE
    WHEN u.status = 'ACTIVE'   THEN 'active'
    WHEN u.status = 'PENDING'  THEN 'active'
    WHEN u.status = 'MERGED'   THEN 'merged'
    WHEN u.status = 'ACQUIRED' THEN 'merged'
    WHEN u.status = 'DEFUNCT'  AND u.successor_id IS NOT NULL THEN 'renamed'
    WHEN u.status = 'DEFUNCT'  THEN 'retired'
    ELSE LOWER(u.status)
  END                                                          AS status,
  u.status                                                     AS raw_status,
  u.created_at                                                 AS effective_from,
  CASE
    WHEN u.status IN ('DEFUNCT', 'MERGED', 'ACQUIRED')
      THEN COALESCE(u.reviewed_at, u.updated_at)
    ELSE NULL
  END                                                          AS effective_to,
  s.id                                                         AS successor_eia_id,
  s.slug                                                       AS successor_slug,
  'EIA-861 + manual overrides'::TEXT                           AS source,
  u.deprecation_reason                                         AS deprecation_reason,
  u.deprecation_reason                                         AS notes
FROM public.utilities u
LEFT JOIN public.utilities s
  ON s.id = u.successor_id
 AND s.deleted_at IS NULL
WHERE u.deleted_at IS NULL
  AND (
    -- Only show rows that are useful for lifecycle reconciliation: the
    -- deprecated ones themselves plus any ACTIVE utility that a deprecated
    -- row points at as a successor (so consumers can do a single lookup).
    u.status IN ('DEFUNCT', 'MERGED', 'ACQUIRED')
    OR u.id IN (
      SELECT successor_id FROM public.utilities
      WHERE successor_id IS NOT NULL AND deleted_at IS NULL
    )
  );

COMMENT ON VIEW public.v_deprecated_utilities IS
  'Utility lifecycle view (M10). One row per historical or successor '
  'utility. Fields: eia_id, utility_slug, name, status (active|retired|'
  'merged|renamed), raw_status, effective_from, effective_to, '
  'successor_eia_id, successor_slug, source, deprecation_reason, notes. '
  'Backs GET /api/v1/utilities/deprecated.';

COMMIT;
