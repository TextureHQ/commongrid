-- Register the curated IOU demand-response programs feed in the data_sources
-- registry (CG-286 provenance). SyncRecord.sourceId is a NOT NULL FK to
-- data_sources(id) as of 0028, so the "Sync IOU DR Programs" job cannot write a
-- program version until its source row exists.
--
-- The IOU DR programs are curated from the utilities' own public program pages
-- (there is no federal open feed of NAMED DR programs: EIA-861 is aggregate
-- statistics, and DSIRE's structured API is access-gated + licensed). So this
-- is a community/editorial catalog, authority_tier 'community', cadence
-- 'on-demand' — mirroring the existing 'manual' and 'community' rows seeded in
-- 0028. license NULL: entries link to the utilities' own public pages; no
-- redistribution claim is made here.
--
-- Idempotent: ON CONFLICT DO NOTHING so a re-run (or a fresh CI database that
-- already applied it) is a no-op.

INSERT INTO "data_sources" ("id", "display_name", "authority_tier", "cadence", "homepage_url") VALUES
  ('iou-dr-curated', 'Curated IOU Demand Response Programs', 'community', 'on-demand', NULL)
ON CONFLICT ("id") DO NOTHING;
