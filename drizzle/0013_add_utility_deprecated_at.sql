-- Migration: add `public.utilities.deprecated_at` column.
--
-- Background
-- ----------
-- CommonGrid already tracks utility lifecycle via two columns on
-- public.utilities:
--
--   - status             (text: ACTIVE | MERGED | ACQUIRED | DEFUNCT | PENDING)
--   - deprecation_reason (text, nullable, free-form)
--   - successor_id       (self-FK, nullable; set when status = MERGED/ACQUIRED)
--
-- What's missing is a dedicated timestamp of when a utility crossed into a
-- deprecated state. This is a general-interest signal — anyone tracking
-- utility lifecycle (journalists covering consolidation, researchers with
-- longitudinal datasets, downstream integrations that key on EIA ids) needs
-- a stable, queryable "this utility was deprecated on ..." field so they
-- can incrementally poll for changes since their last sync.
--
-- This migration adds `deprecated_at TIMESTAMPTZ NULL` alongside the
-- existing columns. It does NOT backfill historical deprecations — those
-- rows keep `deprecated_at = NULL`. The public
-- `GET /api/v1/utilities/deprecated` endpoint falls back to `updated_at`
-- when `deprecated_at` is null, so existing deprecated rows stay visible;
-- future deprecations should set the column precisely.
--
-- Index: we add a partial btree on `deprecated_at` scoped to rows whose
-- status encodes a deprecation, so the endpoint's `?since=...` filter and
-- "deprecated utilities only" predicate are both index-backed.
--
-- Idempotency
-- -----------
-- Uses IF NOT EXISTS everywhere. Safe to re-apply.
--
-- Deploy
-- ------
-- CommonGrid CI does NOT auto-apply migrations; a maintainer runs this
-- against Neon after merge.

BEGIN;

-- 1. Nullable deprecation timestamp.
ALTER TABLE public.utilities
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.utilities.deprecated_at IS
  'Timestamp when the utility transitioned into a deprecated status '
  '(MERGED, ACQUIRED, or DEFUNCT). NULL for currently-active utilities '
  'and for historical deprecations that predate this column. Consumers '
  'tracking lifecycle should use COALESCE(deprecated_at, updated_at) to '
  'handle the legacy-null case.';

-- 2. Partial index supporting the public /api/v1/utilities/deprecated
--    endpoint's `?since=...` filter. Scoped to deprecated statuses so the
--    index stays small (~30 rows today vs. ~3100 total utilities).
CREATE INDEX IF NOT EXISTS idx_utilities_deprecated_at
  ON public.utilities (deprecated_at DESC NULLS LAST)
  WHERE status IN ('MERGED', 'ACQUIRED', 'DEFUNCT')
    AND deleted_at IS NULL;

COMMIT;
