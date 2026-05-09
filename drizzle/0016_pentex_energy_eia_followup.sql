-- Migration: Promote pentex-energy from manual to EIA-861-attributed (4262)
--
-- Background
-- ----------
-- Migration 0015 (PR #246, Linear ALL-824) tagged `pentex-energy` as
-- `source='manual'` on the assumption that it was a Texas natural gas
-- distribution cooperative (out of scope of EIA Form 861).
--
-- Post-merge, however, the row's existing `deprecation_reason` (set by an
-- earlier audit pass and preserved by the COALESCE in 0015) made the right
-- linkage explicit:
--
--   "PenTex Energy is the d/b/a / consumer brand of Cooke County Electric
--    Cooperative Association, EIA Utility ID 4262; same charter date,
--    same five-county service territory."
--
-- Verification against EIA Form 861 (2024 release) confirms the entity:
--
--   Utility_Data_2024.xlsx        / States           : 4262 | Cooke County Elec Coop Assn | TX
--   Service_Territory_2024.xlsx   / Counties_States  : 4262 | Cooke County Elec Coop Assn | TX
--   Frame_2024.xlsx               / Frame            : 4262 | Cooke County Elec Coop Assn
--
-- PenTex Energy is the consumer-facing brand the cooperative uses for its
-- electric, propane, and (separately) natural-gas product lines. The
-- electric distribution piece *is* an EIA-861 filer — under the legal
-- entity's full name "Cooke County Electric Cooperative Association",
-- EIA Utility ID 4262.
--
-- This migration corrects the attribution so the canonical EIA ID is
-- discoverable via /api/v1/utilities/{slug} and /api/v1/utilities/by-eia-id/4262.
--
-- The deprecation_reason is left in place — it accurately documents the
-- d/b/a relationship and is useful context for downstream consumers.
--
-- Idempotency
-- -----------
-- Gated on `source IS NULL OR source = 'manual'` AND `eia_id IS NULL` for
-- pentex-energy specifically — re-runs against an already-promoted row are
-- no-ops.

BEGIN;

UPDATE public.utilities
   SET eia_id      = '4262',
       eia_name    = COALESCE(eia_name, 'Cooke County Elec Coop Assn'),
       source      = 'EIA-861 Form 2024',
       source_url  = 'https://www.eia.gov/electricity/data/eia861/zip/f8612024.zip',
       reviewed_at = now(),
       reviewed_by = 'meridian/migration-0016-pentex-eia-followup',
       updated_at  = now()
 WHERE slug = 'pentex-energy'
   AND deleted_at IS NULL
   AND eia_id IS NULL
   AND (source IS NULL OR source = 'manual');

DO $$
DECLARE
  promoted_count integer;
BEGIN
  SELECT count(*) INTO promoted_count
    FROM public.utilities
   WHERE slug = 'pentex-energy'
     AND deleted_at IS NULL
     AND eia_id = '4262'
     AND source = 'EIA-861 Form 2024';

  IF promoted_count <> 1 THEN
    RAISE NOTICE
      'migration 0016: expected pentex-energy to carry eia_id=4262 + source=EIA-861 Form 2024, observed % matches — verify environment',
      promoted_count;
  END IF;
END $$;

COMMIT;
