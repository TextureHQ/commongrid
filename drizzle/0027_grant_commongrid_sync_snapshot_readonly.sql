-- Grant commongrid_sync SELECT on the remaining public reference tables that
-- the Weekly Database Snapshot export needs -- and nothing else.
--
-- BACKGROUND
-- The weekly snapshot (.github/workflows/weekly-snapshot.yml) connects to Neon
-- as `commongrid_sync` and dumps an EXPLICIT ALLOWLIST of 14 public reference
-- tables via `pg_dump --table=...`. pg_dump issues `LOCK TABLE ... IN ACCESS
-- SHARE MODE` on every listed table before dumping, which requires SELECT on
-- each one.
--
-- On 2026-09-21 the (now version-correct, pg17) snapshot run failed with:
--     pg_dump: error: query failed: ERROR: permission denied for table isos
--     detail: Query was: LOCK TABLE public.balancing_authorities, public.isos,
--       public.programs, public.regions, public.rtos, ... IN ACCESS SHARE MODE
--
-- ROOT CAUSE
-- Migration 0026 granted the role SELECT on only the 7 tables the *daily* sync
-- writes (power_plants, substations, transmission_lines, ev_stations,
-- pricing_nodes, utilities, balancing_authorities). But the *snapshot*
-- allowlist covers 7 more read-only reference tables the role never had access
-- to: isos, power_plant_interconnections, programs, regions, rtos, territories,
-- transmission_line_endpoints. pg_dump's LOCK failed on the first of these.
--
-- FIX
-- Grant SELECT-only (read, never write) on exactly those 7 remaining allowlist
-- tables. This keeps least-privilege intact: `users`, `api_keys`, and every
-- other operational/PII table stay invisible to this role. No ALL TABLES sweep.
--
-- Idempotent (GRANT is naturally re-runnable) and guarded on the role's
-- existence so it is a no-op in local dev / fresh CI databases where the
-- `commongrid_sync` login role does not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    -- SELECT only -- these are read-only reference tables the snapshot dumps
    -- but the sync never writes. Explicitly enumerated; nothing else exposed.
    GRANT SELECT ON
      public.isos,
      public.power_plant_interconnections,
      public.programs,
      public.regions,
      public.rtos,
      public.territories,
      public.transmission_line_endpoints
    TO commongrid_sync;
  END IF;
END $$;
