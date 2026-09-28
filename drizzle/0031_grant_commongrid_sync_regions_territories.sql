-- Grant the commongrid_sync role read/write on `regions` and `territories` so
-- the scheduled state service-territory sync can upsert region rows through
-- lib/sync/apply-sync.ts and upsert territory geometry via PostGIS.
--
-- BACKGROUND
-- The "Sync State Boundaries" job (.github/workflows/sync-state-boundaries.yml
-- -> scripts/sync-state-boundaries.ts) connects to Neon as `commongrid_sync`
-- and, in publishToDatabase(), calls applySync(records, { entityType: "region" })
-- followed by a PostGIS `INSERT ... ON CONFLICT` into `territories`.
-- applySync runs `SELECT id FROM "regions" WHERE id = $1 FOR UPDATE` and then
-- INSERT/UPDATEs the row; the geometry upsert writes `territories`.
--
-- On 2026-09-24 the first dispatch run (actions run 36074800250) fetched all
-- sources fine, then failed at the first write with:
--     error: permission denied for table regions   (SQLSTATE 42501)
--
-- ROOT CAUSE
-- Migration 0026 enumerated the exact reference tables commongrid_sync may
-- write (power_plants, substations, transmission_lines, ev_stations,
-- pricing_nodes, utilities, balancing_authorities, change_batches,
-- entity_versions, entity_geometry_versions) -- deliberately no ALL TABLES
-- sweep, for least privilege. 0029 later added `programs`. `regions` and
-- `territories` were never sync targets before CG-290, so they were never
-- granted. This migration adds exactly those two tables.
--
-- regions.id and territories.id are both text primary keys (not bigserial), so
-- -- unlike entity_versions -- no sequence grant is required. The
-- change-tracking writes (change_batches, entity_versions,
-- entity_geometry_versions) and their sequences were already granted in 0026,
-- so no other grant is needed. The state sync also issues a guarded
-- `UPDATE regions SET deleted_at = now() ...` to supersede stale HIFLD rows,
-- which the UPDATE privilege below covers.
--
-- Idempotent (GRANT is naturally re-runnable) and guarded on the role's
-- existence so it is a no-op in environments (local dev, fresh CI databases)
-- where the `commongrid_sync` login role does not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON public.regions TO commongrid_sync;
    GRANT SELECT, INSERT, UPDATE ON public.territories TO commongrid_sync;
  END IF;
END $$;
