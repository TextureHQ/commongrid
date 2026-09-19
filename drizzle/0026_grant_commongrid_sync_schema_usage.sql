-- Grant the commongrid_sync role EXACTLY the privileges the scheduled data
-- syncs need -- and nothing else. Least privilege: this role syncs public
-- reference datasets (power plants, substations, etc.) and must NOT be able to
-- read `users` or any other unrelated table.
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
-- `USAGE ON SCHEMA public`, so its scoped table grants were inert.
--
-- Note: GRANT USAGE ON SCHEMA public grants NO table access on its own -- it
-- only lets the role resolve names in the schema. Per-table privileges still
-- gate every table, so `users` and other unrelated tables remain inaccessible.
--
-- Additionally, apply-sync.ts INSERTs into `entity_versions` and
-- `entity_geometry_versions`, whose primary keys are bigserial. INSERTs into a
-- serial column require privileges on the backing sequence, so the role also
-- needs USAGE,SELECT on exactly those two sequences (otherwise the next error
-- after the USAGE fix would be "permission denied for sequence ...").
--
-- This migration is idempotent (GRANT is naturally re-runnable) and is guarded
-- on the role's existence so it is a no-op in environments (local dev, fresh CI
-- databases) where the `commongrid_sync` login role does not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    -- 1. The actual unblocker for the 42P01: let the role resolve names in the
    --    schema. This does NOT grant table access -- per-table grants below
    --    are what actually gate data; everything not listed stays invisible.
    GRANT USAGE ON SCHEMA public TO commongrid_sync;

    -- 2. Read/write ONLY on the reference tables the sync touches. Explicitly
    --    enumerated -- no ALL TABLES sweep -- so `users` and other tables are
    --    never exposed to this role.
    GRANT SELECT, INSERT, UPDATE ON
      public.power_plants,
      public.substations,
      public.transmission_lines,
      public.ev_stations,
      public.pricing_nodes,
      public.utilities,
      public.balancing_authorities,
      public.change_batches,
      public.entity_versions,
      public.entity_geometry_versions
    TO commongrid_sync;

    -- 3. Only the two sequences backing the bigserial PKs the sync INSERTs
    --    into (entity_versions.id, entity_geometry_versions.id). No ALL
    --    SEQUENCES sweep.
    GRANT USAGE, SELECT ON SEQUENCE
      public.entity_versions_id_seq,
      public.entity_geometry_versions_id_seq
    TO commongrid_sync;
  END IF;
END $$;
