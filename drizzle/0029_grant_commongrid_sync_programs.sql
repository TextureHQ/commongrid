-- Grant the commongrid_sync role read/write on `programs` so the curated IOU
-- demand-response sync can upsert program rows through lib/sync/apply-sync.ts.
--
-- BACKGROUND
-- The new "Sync IOU DR Programs" job (.github/workflows/sync-iou-dr-programs.yml
-- -> scripts/sync-iou-dr-programs.ts) connects to Neon as `commongrid_sync` and,
-- in publishToDatabase(), calls applySync(records, { entityType: "program" }).
-- applySync runs `SELECT id FROM "programs" WHERE id = $1 FOR UPDATE` and then
-- INSERT/UPDATEs the row.
--
-- On 2026-09-23 the first scheduled/dispatch run resolved 66/66 programs, then
-- failed at the write with:
--     error: permission denied for table programs   (SQLSTATE 42501)
--
-- ROOT CAUSE
-- Migration 0026 enumerated the exact reference tables commongrid_sync may
-- write (power_plants, substations, transmission_lines, ev_stations,
-- pricing_nodes, utilities, balancing_authorities, change_batches,
-- entity_versions, entity_geometry_versions) -- deliberately no ALL TABLES
-- sweep, for least privilege. `programs` did not exist as a sync target then,
-- so it was never granted. This migration adds exactly that one table.
--
-- programs.id is a text primary key (not bigserial), so -- unlike
-- entity_versions -- no sequence grant is required. The change-tracking writes
-- (change_batches, entity_versions, entity_geometry_versions) and their
-- sequences were already granted in 0026, so no other grant is needed.
--
-- Idempotent (GRANT is naturally re-runnable) and guarded on the role's
-- existence so it is a no-op in environments (local dev, fresh CI databases)
-- where the `commongrid_sync` login role does not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON public.programs TO commongrid_sync;
  END IF;
END $$;
