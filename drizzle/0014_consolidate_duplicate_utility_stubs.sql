-- Migration: Consolidate 30 duplicate utility stubs from initial 2026-04-15 batch import
--
-- Problem
-- -------
-- During the initial 2026-04-15 batch seed of `public.utilities`, 153 rows
-- were created from a non-EIA source (logo/web scrape pipeline) using
-- abbreviated names and ad-hoc slugs. Many of those entries duplicate a
-- canonical EIA-861-sourced row that was created in the same batch under
-- the full official name. The two records refer to the *same real-world
-- utility* but the abbreviated stubs were never linked to the EIA filing
-- and so have `eia_id IS NULL`.
--
-- Concrete examples (NE PPDs are the densest cluster):
--
--   Stub                          → Canonical EIA-861 row (eia_id)
--   ─────────────────────────────────────────────────────────────────
--   burt-county-ppd               → burt-county-public-power-district  (2599)
--   cornhusker-ppd                → cornhusker-public-power-district   (4373)
--   elkhorn-rppd                  → elkhorn-rural-public-power-district (5780)
--   citizens-electric-corp (MO)   → citizens-electric-mo               (3600)
--   block-island-power-company    → block-island-utility-district      (1857)
--   electrical-district-2         → electrical-district-no2-pinal-county (15048)
--   ...30 in total
--
-- Symptom in production (2026-05-09 #agent-ops thread)
-- ----------------------------------------------------
-- Talos's NISC matcher pipeline reconciles `crm_organizations.common_grid_slug`
-- → `eia_utility_id` via `GET /api/v1/utilities/{slug}`. For these 30 stubs
-- the fetch succeeds (200) but `eiaId` is null, so `crm_organizations` rows
-- never receive an `eia_utility_id` and the downstream NISC join shows
-- empty activity for the affected utilities (Vermont Electric was a
-- different bug — already fixed by Talos's N4b run).
--
-- Fix
-- ---
-- For each (stub_slug, canonical_slug) pair, set on the stub row:
--   status                = 'MERGED'
--   successor_id          = canonical row's id
--   deprecation_reason    = consolidation note
--   reviewed_at           = now()
--   reviewed_by           = audit string
-- The stub keeps its slug so old URLs continue to resolve. The
-- `[slug]` route is updated separately to follow `successor_id` when
-- status='MERGED' so consumers transparently receive canonical EIA-backed
-- data while the stable slug-as-url contract is preserved.
--
-- The remaining 7 of Talos's 37 stale slugs (candl-electric-cooperative,
-- corn-belt-energy-corporation, isle-au-haut-electric-power-company,
-- pentex-energy, ravalli-electric-cooperative, rush-shelby-energy,
-- south-utah-valley-elec-svc-dist) are real distinct utilities with no
-- existing canonical EIA-861 row in CommonGrid. They're tracked in a
-- follow-up issue for direct EIA-861 lookup + manual eia_id assignment;
-- they are NOT consolidated by this migration.
--
-- Idempotency
-- -----------
-- This migration uses an UPDATE keyed on the (stub_slug, canonical_slug)
-- pair via a JOIN. Re-running it has no effect: rows already MERGED are
-- still MERGED and `successor_id` is set to the same canonical id.
--
-- Safety
-- ------
-- - No data is deleted (soft delete column `deleted_at` not touched).
-- - No FKs are mutated outside `successor_id` (a self-reference).
-- - The `v_deprecated_utilities` view will surface these 30 rows
--   automatically as `status='merged'` with a `successor_slug`.
-- - The `idx_utilities_slug` unique constraint is unaffected (no slug
--   change). Old slug URLs keep working.
-- - Unique slug constraint already prevents future duplicate stubs.

BEGIN;

-- (stub_slug, canonical_slug) pairs validated 2026-05-09 against
-- production CommonGrid data via name-similarity + manual review.
WITH consolidations(stub_slug, canonical_slug) AS (
  VALUES
    ('american-samoa-power-authority-1',         'american-samoa-power-authority-2'),
    ('block-island-power-company',               'block-island-utility-district'),
    ('brown-atchison-electric-co-op-assn',       'brown-atchison-e-c-a'),
    ('burt-county-ppd',                          'burt-county-public-power-district'),
    ('butler-public-power-district-ne-1',        'butler-public-power-district-ne-2'),
    ('cedar-knox-ppd',                           'cedar-knox-public-power-district'),
    ('central-missouri-electric-cooperative',    'co-mo-electric-co-op'),
    ('citizens-electric-corp',                   'citizens-electric-mo'),
    ('city-of-stromsburg-ne-1',                  'city-of-stromsburg-ne-2'),
    ('cornhusker-ppd',                           'cornhusker-public-power-district'),
    ('cuming-county-ppd',                        'cuming-county-public-power-district'),
    ('custer-ppd',                               'custer-public-power-district'),
    ('dawson-ppd',                               'dawson-power-district'),
    ('electrical-district-2',                    'electrical-district-no2-pinal-county'),
    ('elkhorn-rppd',                             'elkhorn-rural-public-power-district'),
    ('fayetteville-public-utilities',            'city-of-fayetteville'),
    ('jefferson-county-pud-1',                   'pud-no-1-of-jefferson-county'),
    ('lafollette-utilities',                     'city-of-lafollette'),
    ('lassen-municipal-utility-district-ca-1',   'lassen-municipal-utility-district-ca-2'),
    ('loup-river-ppd',                           'loup-river-public-power-district'),
    ('mccook-ppd',                               'mccook-public-power-district'),
    ('norris-ppd',                               'norris-public-power-district'),
    ('north-central-ppd',                        'north-central-public-power-district'),
    ('northwest-rppd',                           'northwest-rural-pub-power-district'),
    ('polk-county-rppd',                         'polk-county-rural-pub-power-district'),
    ('roosevelt-ppd',                            'roosevelt-public-power-district'),
    ('south-central-ppd',                        'south-central-public-power-district'),
    ('southwest-ppd',                            'southwest-public-power-district'),
    ('stanton-county-ppd',                       'stanton-county-public-power-district'),
    ('twin-valleys-ppd',                         'twin-valleys-public-power-district')
)
UPDATE public.utilities AS stub
SET
  status              = 'MERGED',
  successor_id        = canonical.id,
  deprecation_reason  = 'Consolidated with EIA-sourced canonical record (duplicate stub from 2026-04-15 batch import; EIA-861 row is canonical)',
  reviewed_at         = now(),
  reviewed_by         = 'meridian/migration-0014-stub-consolidation',
  updated_at          = now()
FROM consolidations c
JOIN public.utilities AS canonical
  ON canonical.slug = c.canonical_slug
 AND canonical.deleted_at IS NULL
 AND canonical.eia_id IS NOT NULL  -- safety: refuse to point at another stub
WHERE stub.slug = c.stub_slug
  AND stub.deleted_at IS NULL
  AND stub.eia_id IS NULL;          -- safety: only touch stubs

-- Sanity assertion: we expect exactly 30 rows updated. If somebody
-- ran this against a database where a canonical slug doesn't exist
-- yet (or a stub was already promoted), the count will differ and
-- the operator should investigate before continuing.
DO $$
DECLARE
  expected_count integer := 30;
  actual_count integer;
BEGIN
  SELECT count(*)
    INTO actual_count
    FROM public.utilities u
    JOIN public.utilities s ON s.id = u.successor_id
   WHERE u.deleted_at IS NULL
     AND u.eia_id IS NULL
     AND u.status = 'MERGED'
     AND u.reviewed_by = 'meridian/migration-0014-stub-consolidation'
     AND s.deleted_at IS NULL
     AND s.eia_id IS NOT NULL;

  IF actual_count <> expected_count THEN
    RAISE NOTICE
      'migration 0014: expected % consolidated stubs, observed % — verify environment matches production seed before proceeding',
      expected_count, actual_count;
  END IF;
END $$;

COMMIT;
