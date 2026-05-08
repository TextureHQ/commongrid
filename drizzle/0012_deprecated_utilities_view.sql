-- Migration: v_deprecated_utilities lifecycle view (M10)
--
-- Spec: TextureHQ/mono specs/relay/commongrid-nisc-matcher.md v1.5, task M10.
--
-- This is a small, polled lifecycle view — NOT a data replication primitive.
-- Downstream server-to-server consumers (e.g. CRM Relay) poll this view to
-- detect linkage keys that have been deprecated on the CommonGrid side so
-- they can mark their local `eia_utility_id` references stale. The surface
-- is intentionally minimal: the EIA id that was deprecated, when it was
-- deprecated, an optional successor EIA id when a utility merged into
-- another, and an optional human-readable reason.
--
-- Shape (binding per spec):
--
--   SELECT
--     eia_id,
--     deleted_at          AS deprecated_at,
--     successor_eia_id,       -- nullable
--     deprecation_reason  AS reason   -- nullable text
--   FROM public.utilities
--   WHERE deleted_at IS NOT NULL;
--
-- Columns added to public.utilities (nullable, non-breaking):
--   * deprecation_reason TEXT — optional free-text reason captured at
--     soft-delete time (e.g. "merged into NYSEG", "EIA ID retired 2024-09").
--
-- `successor_eia_id` is derived at query time via a self-join on the
-- existing public.utilities.successor_id column (text slug FK), so we do
-- not denormalize the EIA ID into a separate column. This avoids
-- double-bookkeeping between successor_id and successor_eia_id.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Schema additions
-- --------------------------------------------------------------------------

ALTER TABLE public.utilities
  ADD COLUMN IF NOT EXISTS deprecation_reason text;

COMMENT ON COLUMN public.utilities.deprecation_reason IS
  'Optional human-readable reason this utility was deprecated (soft-deleted). Surfaced via commongrid.v_deprecated_utilities for downstream lifecycle polling. See specs/relay/commongrid-nisc-matcher.md M10.';

-- --------------------------------------------------------------------------
-- 2. Lifecycle view
-- --------------------------------------------------------------------------
-- Returns one row per soft-deleted utility with the minimum signal a
-- downstream consumer needs to detect a stale linkage key:
--   * eia_id            — the EIA Utility ID that was deprecated (text)
--   * deprecated_at     — timestamp the soft-delete happened
--   * successor_eia_id  — EIA id of the successor utility, NULL if none
--   * reason            — free-text reason, NULL if not captured
--
-- Filter: eia_id IS NOT NULL because a consumer holding a null linkage
-- key has nothing to reconcile. Utilities without an EIA ID are out of
-- scope for EIA-keyed server-to-server consumers.

CREATE OR REPLACE VIEW commongrid.v_deprecated_utilities AS
SELECT
  u.eia_id                AS eia_id,
  u.deleted_at            AS deprecated_at,
  succ.eia_id             AS successor_eia_id,
  u.deprecation_reason    AS reason
FROM public.utilities u
LEFT JOIN public.utilities succ ON succ.id = u.successor_id
WHERE u.deleted_at IS NOT NULL
  AND u.eia_id IS NOT NULL;

COMMENT ON VIEW commongrid.v_deprecated_utilities IS
  'Lifecycle signal for downstream CRM/consumer polling. One row per soft-deleted utility with an EIA id. Not a replication surface — see specs/relay/commongrid-nisc-matcher.md M10 (v1.5).';

-- --------------------------------------------------------------------------
-- 3. Grants (read-only, scoped to internal_api_consumer; nothing to PUBLIC)
-- --------------------------------------------------------------------------

REVOKE ALL ON commongrid.v_deprecated_utilities FROM PUBLIC;
GRANT SELECT ON commongrid.v_deprecated_utilities TO internal_api_consumer;

COMMIT;
