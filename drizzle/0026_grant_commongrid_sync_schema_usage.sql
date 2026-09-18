-- Grant the commongrid_sync role the privileges the scheduled data syncs need.
--
-- BACKGROUND
-- The daily "Sync Monthly Data" job (.github/workflows/sync-monthly.yml ->
-- scripts/sync-power-plants-monthly.ts) connects to Neon as `commongrid_sync`
-- and, in publishToDatabase(), runs `select "id" from "power_plants"` before
-- upserting the EIA-860M generator updates through lib/sync/apply-sync.ts.
--
-- On 2026-09-18 that job began failing with:
--     error: relation "power_plants" does not exist   (SQLSTATE 42P01)
-- even though the table exists and the role already held table-level
-- SELECT/INSERT/UPDATE on it.
--
-- ROOT CAUSE
-- Table privileges and schema USAGE are independent in Postgres. A role that
-- lacks USAGE on the schema cannot resolve any object name inside it, so an
-- unqualified `power_plants` fails as 42P01 ("does not exist") rather than
-- 42501 ("permission denied"). `commongrid_sync` was missing
-- `USAGE ON SCHEMA public`, so its table grants were inert.
--
-- Additionally, apply-sync.ts INSERTs into `entity_versions` and
-- `entity_geometry_versions`, whose primary keys are bigserial. INSERTs into a
-- serial column require privileges on the backing sequence, so the role also
-- needs USAGE,SELECT on the schema's sequences (otherwise the next error after
-- the USAGE fix would be "permission denied for sequence ...").
--
-- This migration is idempotent: GRANT is naturally re-runnable, and it is
-- guarded on the role's existence so it is a no-op in environments (local dev,
-- fresh CI databases) where the `commongrid_sync` login role does not exist.
-- ALTER DEFAULT PRIVILEGES future-proofs newly created tables/sequences so the
-- sync does not silently lose access the next time the registry grows.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    -- 1. The actual unblocker for the 42P01: let the role enter the schema.
    GRANT USAGE ON SCHEMA public TO commongrid_sync;

    -- 2. Read/write on every current table. The sync SELECTs existing ids and
    --    upserts entity + changelog rows; re-asserting the table grants here
    --    keeps the full privilege set in one committed, replayable place.
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO commongrid_sync;

    -- 3. Sequences backing bigserial PKs (entity_versions,
    --    entity_geometry_versions) — required for INSERT.
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO commongrid_sync;

    -- 4. Future-proofing: tables/sequences created after this migration
    --    inherit the same grants, so a later registry table does not
    --    reintroduce the 42P01.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE ON TABLES TO commongrid_sync;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO commongrid_sync;
  END IF;
END $$;
