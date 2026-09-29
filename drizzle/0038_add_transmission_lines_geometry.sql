-- CG-328: transmission_lines geometry becomes the single source of truth for
-- tile generation, replacing the committed data/transmission-lines.geojson.
-- Additive + idempotent: adds a nullable PostGIS MultiLineString column and a
-- spatial index. Backfilled by sync-transmission-lines.ts (HIFLD) and read by
-- prepare-transmission-lines-geojson.mjs via ST_AsGeoJSON.
ALTER TABLE public.transmission_lines
  ADD COLUMN IF NOT EXISTS geometry geometry(MultiLineString, 4326);
--> statement-breakpoint
-- GiST spatial index for tile-export bbox scans. CONCURRENTLY is not usable
-- inside the migration transaction; the table is ~52k rows so a plain build is
-- fast. IF NOT EXISTS keeps the migration idempotent across environments.
CREATE INDEX IF NOT EXISTS idx_tl_geometry ON public.transmission_lines USING GIST (geometry);
--> statement-breakpoint
-- The data-sync role writes geometry during the HIFLD sync.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.transmission_lines TO commongrid_sync;
  END IF;
END $$;
