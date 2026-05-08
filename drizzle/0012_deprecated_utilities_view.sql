-- Migration: v_deprecated_utilities lifecycle view (M10)
--
-- Spec: TextureHQ/mono specs/relay/commongrid-nisc-matcher.md v1.5, task M10.
--
-- Small, polled lifecycle view — NOT a data replication primitive.
-- Downstream server-to-server consumers (e.g. CRM Relay) poll this view to
-- detect linkage keys that have been deprecated on the CommonGrid side so
-- they can mark their local `eia_utility_id` references stale. The surface
-- is intentionally minimal: the EIA id that was deprecated, when it was
-- deprecated, an optional successor EIA id when a utility merged into
-- another, and a short reason code.
--
-- Shape is public-safe and backward-compatible with existing consumers.
--
-- Columns added to public.utilities (nullable, non-breaking):
--   * deprecation_reason TEXT — optional free-text reason captured when a
--     utility is marked DEFUNCT or MERGED. Surfaced (truncated/normalized)
--     via the `reason` column in the view.
--
-- `successor_eia_id` is derived at query time via a self-join on the
-- existing public.utilities.successor_id column (text FK), so we do not
-- denormalize the EIA ID into a separate column. Avoids double-bookkeeping
-- between successor_id and successor_eia_id.

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Schema additions
-- --------------------------------------------------------------------------

ALTER TABLE public.utilities
  ADD COLUMN IF NOT EXISTS deprecation_reason text;

COMMENT ON COLUMN public.utilities.deprecation_reason IS
  'Optional human-readable reason this utility was deprecated (DEFUNCT/MERGED). Surfaced via commongrid.v_deprecated_utilities for downstream lifecycle polling. See specs/relay/commongrid-nisc-matcher.md M10.';

-- --------------------------------------------------------------------------
-- 2. Lifecycle view
-- --------------------------------------------------------------------------
-- One row per live utility whose status marks it deprecated (DEFUNCT or
-- MERGED) and which carries an EIA id. Soft-deleted rows (deleted_at IS NOT
-- NULL) are excluded — once a row is soft-deleted it leaves the public
-- surface entirely and downstream consumers should fall back on their
-- existing reconciliation paths.
--
-- `reason` is a short, stable code:
--   * 'merged'          — status = MERGED
--   * 'dissolved'       — status = DEFUNCT (no successor)
--   * 'eia_id_retired'  — reserved for future use; not emitted today
--   * 'other'           — status not covered above (defensive fallback)
-- A human-readable free-text note captured in deprecation_reason is
-- intentionally NOT leaked through this column to keep the contract tight;
-- consumers that need colour can query the underlying table.

CREATE OR REPLACE VIEW commongrid.v_deprecated_utilities AS
SELECT
  u.eia_id                                                AS eia_id,
  u.updated_at                                            AS deprecated_at,
  succ.eia_id                                             AS successor_eia_id,
  CASE
    WHEN u.status = 'MERGED'  THEN 'merged'
    WHEN u.status = 'DEFUNCT' THEN 'dissolved'
    ELSE 'other'
  END                                                     AS reason
FROM public.utilities u
LEFT JOIN public.utilities succ
  ON succ.id = u.successor_id
 AND succ.deleted_at IS NULL
WHERE u.deleted_at IS NULL
  AND u.eia_id IS NOT NULL
  AND u.status IN ('DEFUNCT', 'MERGED');

COMMENT ON VIEW commongrid.v_deprecated_utilities IS
  'Lifecycle signal for downstream CRM/consumer polling. One row per live utility whose status is DEFUNCT or MERGED and which has an EIA id. Not a replication surface — see specs/relay/commongrid-nisc-matcher.md M10 (v1.5).';

-- --------------------------------------------------------------------------
-- 3. Grants (read-only, scoped to internal_api_consumer; nothing to PUBLIC)
-- --------------------------------------------------------------------------

REVOKE ALL ON commongrid.v_deprecated_utilities FROM PUBLIC;
GRANT SELECT ON commongrid.v_deprecated_utilities TO internal_api_consumer;

COMMIT;
