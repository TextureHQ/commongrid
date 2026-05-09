-- Migration: Backfill eia_id + source attribution for 7 unmatched utility stubs
--
-- Background (Linear ALL-824)
-- ---------------------------
-- After migration 0014 consolidated 30 duplicate utility stubs against their
-- canonical EIA-861-sourced counterparts, an audit of `utilities WHERE eia_id
-- IS NULL AND status='ACTIVE'` surfaced 7 remaining stubs that are *not*
-- (yet) linked to an EIA filing in CommonGrid. They were originally imported
-- by the logo/web-scrape pipeline (2026-04-15 batch) without being matched
-- to an EIA-861 utility ID.
--
-- This migration finishes the backfill so downstream consumers (Talos's
-- NISC matcher, the /api/v1/utilities/by-eia-id/{eiaId} resolver, public
-- researchers, journalists) can reach these utilities by canonical EIA
-- Utility ID — or, for the rows that legitimately have no EIA-861 row,
-- so the `source` field carries an explicit `manual` provenance with a
-- documented reason instead of NULL.
--
-- Source-of-truth lookups were performed against the EIA Form 861 2024
-- release zip (https://www.eia.gov/electricity/data/eia861/zip/f8612024.zip,
-- Last-Modified: 2025-12-04). Names were matched on (utility_name, state)
-- across the Utility_Data_2024, Service_Territory_2024, Short_Form_2024,
-- Frame_2024, Sales_Ult_Cust_2024, Operational_Data_2024, and
-- Advanced_Meters_2024 sheets.
--
-- Mapping
-- -------
-- Group 1 — direct EIA-861 match → backfill eia_id + source + source_url:
--
--   Stub slug                           → EIA-861 utility name           (eia_id)
--   ─────────────────────────────────────────────────────────────────────────────
--   candl-electric-cooperative          → C & L Electric Coop Corp        (2678)   AR
--   corn-belt-energy-corporation        → Corn Belt Energy Corporation    (4362)   IL
--   ravalli-electric-cooperative        → Ravalli County Elec Coop, Inc   (26916)  MT
--   rush-shelby-energy                  → RushShelby Energy               (17038)  IN
--
-- Group 2 — d/b/a / brand alias of an existing EIA-861 row already in
-- CommonGrid → consolidate the stub against its canonical row using the
-- same status='MERGED' / successor_id pattern as migration 0014:
--
--   Stub slug      Canonical slug                              (eia_id)
--   ───────────────────────────────────────────────────────────────────
--   pentex-energy  cooke-county-electric-co-op-association      (4262)  TX
--
-- PenTex Energy is the consumer-facing brand of Cooke County Electric
-- Cooperative Association (chartered 1938, Muenster TX). EIA-861 still
-- carries the legal name "Cooke County Elec Coop Assn"; PenTex's own
-- /our-history page confirms the same chartering date and an identical
-- service territory (Cooke, Montague, Grayson, Wise, Denton counties).
-- Treating it as a separate utility would double-count the same coop, so
-- we redirect the stub at the canonical row exactly as migration 0014 did
-- for the 30 duplicate-stub cluster.
--
-- Group 3 — genuinely absent from EIA-861 → tag source='manual' with an
-- explanatory deprecation_reason so it's clear *why* eia_id stays NULL:
--
--   Stub slug                            Reason
--   ──────────────────────────────────────────────────────────────────────────
--   isle-au-haut-electric-power-company  Tiny Maine island co-op (~80
--                                        customers, ~$120K annual revenue);
--                                        below EIA-861 reporting threshold
--                                        and not present in any 2024 EIA-861
--                                        sheet (Frame, Utility_Data,
--                                        Service_Territory, or Short_Form).
--   south-utah-valley-elec-svc-dist      Utah special service / improvement
--                                        district (a/k/a SUVPower) serving
--                                        unincorporated Utah County. Does
--                                        not file Form 861 directly;
--                                        absent from the 2024 EIA-861
--                                        Frame, Utility_Data,
--                                        Service_Territory, and Short_Form
--                                        sheets. Wholesale power is
--                                        purchased; reporting (if any)
--                                        rolls up under the supplier.
--
-- The `deprecation_reason` text is informational only — `status` stays
-- ACTIVE for these two rows; we are simply documenting *why* eia_id will
-- remain NULL.
--
-- Idempotency
-- -----------
-- - Group 1 update is gated on `eia_id IS NULL` per row → no-op on a
--   database that has already been backfilled.
-- - Group 2 update mirrors migration 0014: gated on `status <> 'MERGED'`
--   AND `eia_id IS NULL` AND the canonical row having a non-null eia_id.
-- - Group 3 update is gated on `source IS DISTINCT FROM 'manual'` AND
--   `deprecation_reason IS NULL`, so re-running on an already-tagged row
--   is a no-op.
--
-- Verification
-- ------------
-- After running:
--
--   SELECT slug, eia_id, source, source_url, status, successor_id IS NOT NULL AS merged
--     FROM public.utilities
--    WHERE slug IN (
--      'candl-electric-cooperative','corn-belt-energy-corporation',
--      'isle-au-haut-electric-power-company','pentex-energy',
--      'ravalli-electric-cooperative','rush-shelby-energy',
--      'south-utah-valley-elec-svc-dist')
--    ORDER BY slug;
--
-- Expected:
--   - 4 rows with non-null eia_id + source='EIA-861 Form 2024' + status='ACTIVE'
--   - 1 row (pentex-energy) with status='MERGED' + non-null successor_id
--   - 2 rows (isle-au-haut, south-utah-valley) with source='manual' +
--     non-null deprecation_reason + eia_id NULL
--
-- Safety
-- ------
-- - No data is deleted (soft delete column `deleted_at` not touched).
-- - PenTex's existing slug is preserved so old URLs keep resolving via the
--   slug→successor lookup added by the deprecated-utilities view in
--   migration M10.
-- - Unique slug constraint is unaffected (no slug change).
-- - Group 1 + Group 3 updates do not change `status`.

BEGIN;

-- ---------------------------------------------------------------------------
-- Group 1: 4 utilities matched directly to EIA-861 Form 2024
-- ---------------------------------------------------------------------------

WITH matches(slug, eia_id, eia_name) AS (
  VALUES
    ('candl-electric-cooperative',   '2678',  'C & L Electric Coop Corp'),
    ('corn-belt-energy-corporation', '4362',  'Corn Belt Energy Corporation'),
    ('ravalli-electric-cooperative', '26916', 'Ravalli County Elec Coop, Inc'),
    ('rush-shelby-energy',           '17038', 'RushShelby Energy')
)
UPDATE public.utilities u
   SET eia_id      = m.eia_id,
       eia_name    = COALESCE(u.eia_name, m.eia_name),
       source      = 'EIA-861 Form 2024',
       source_url  = 'https://www.eia.gov/electricity/data/eia861/zip/f8612024.zip',
       reviewed_at = now(),
       reviewed_by = 'meridian/migration-0015-eia-861-backfill',
       updated_at  = now()
  FROM matches m
 WHERE u.slug = m.slug
   AND u.deleted_at IS NULL
   AND u.eia_id IS NULL;

-- ---------------------------------------------------------------------------
-- Group 2: 1 d/b/a stub consolidated against existing canonical EIA-861 row
-- (same pattern as migration 0014)
-- ---------------------------------------------------------------------------

WITH consolidations(stub_slug, canonical_slug) AS (
  VALUES
    ('pentex-energy', 'cooke-county-electric-co-op-association')
)
UPDATE public.utilities AS stub
SET
  status              = 'MERGED',
  successor_id        = canonical.id,
  deprecation_reason  = 'Consolidated with EIA-sourced canonical record (PenTex Energy is the d/b/a / consumer brand of Cooke County Electric Cooperative Association, EIA Utility ID 4262; same charter date, same five-county service territory).',
  reviewed_at         = now(),
  reviewed_by         = 'meridian/migration-0015-eia-861-backfill',
  updated_at          = now()
FROM consolidations c
JOIN public.utilities AS canonical
  ON canonical.slug = c.canonical_slug
 AND canonical.deleted_at IS NULL
 AND canonical.eia_id IS NOT NULL  -- safety: refuse to point at another stub
WHERE stub.slug = c.stub_slug
  AND stub.deleted_at IS NULL
  AND stub.eia_id IS NULL
  AND stub.status <> 'MERGED';

-- ---------------------------------------------------------------------------
-- Group 3: 2 utilities legitimately absent from EIA-861 → tag as manual
-- ---------------------------------------------------------------------------

WITH manuals(slug, reason) AS (
  VALUES
    ('isle-au-haut-electric-power-company',
     'Tiny Maine island cooperative (~80 customers, ~$120K annual revenue per the 2023 IRS Form 990); below EIA-861 reporting threshold and not present in any 2024 EIA-861 sheet (Frame, Utility_Data, Service_Territory, or Short_Form).'),
    ('south-utah-valley-elec-svc-dist',
     'Utah special service / improvement district (a/k/a SUVPower) serving unincorporated southern Utah Valley. Does not file Form 861 directly; absent from the 2024 EIA-861 Frame, Utility_Data, Service_Territory, and Short_Form sheets. Wholesale power is purchased and any reporting rolls up under the supplier.')
)
UPDATE public.utilities u
   SET source             = 'manual',
       deprecation_reason = COALESCE(u.deprecation_reason, m.reason),
       reviewed_at        = now(),
       reviewed_by        = 'meridian/migration-0015-eia-861-backfill',
       updated_at         = now()
  FROM manuals m
 WHERE u.slug = m.slug
   AND u.deleted_at IS NULL
   AND u.eia_id IS NULL
   AND (u.source IS DISTINCT FROM 'manual'
        OR u.deprecation_reason IS NULL);

-- ---------------------------------------------------------------------------
-- Sanity assertion: expected post-state of the 7 stubs.
-- If a deployment-time database differs from production seed, surface a
-- NOTICE (not an ERROR) so the operator can investigate without rolling
-- back the migration.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  matched_count integer;
  merged_count  integer;
  manual_count  integer;
BEGIN
  SELECT count(*) INTO matched_count
    FROM public.utilities
   WHERE slug IN (
           'candl-electric-cooperative',
           'corn-belt-energy-corporation',
           'ravalli-electric-cooperative',
           'rush-shelby-energy')
     AND deleted_at IS NULL
     AND eia_id IS NOT NULL
     AND source = 'EIA-861 Form 2024';

  SELECT count(*) INTO merged_count
    FROM public.utilities
   WHERE slug = 'pentex-energy'
     AND deleted_at IS NULL
     AND status = 'MERGED'
     AND successor_id IS NOT NULL;

  SELECT count(*) INTO manual_count
    FROM public.utilities
   WHERE slug IN (
           'isle-au-haut-electric-power-company',
           'south-utah-valley-elec-svc-dist')
     AND deleted_at IS NULL
     AND source = 'manual'
     AND deprecation_reason IS NOT NULL;

  IF matched_count <> 4 THEN
    RAISE NOTICE
      'migration 0015: expected 4 EIA-861-matched stubs, observed % — verify environment matches production',
      matched_count;
  END IF;

  IF merged_count <> 1 THEN
    RAISE NOTICE
      'migration 0015: expected 1 MERGED stub (pentex-energy → cooke-county-electric-co-op-association), observed %',
      merged_count;
  END IF;

  IF manual_count <> 2 THEN
    RAISE NOTICE
      'migration 0015: expected 2 manual-source stubs, observed % — verify environment matches production',
      manual_count;
  END IF;
END $$;

COMMIT;
