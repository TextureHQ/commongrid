-- Groups entity_versions rows produced by one operation, so the changelog can
-- render "EIA-861 sync updated 12,431 utilities" rather than 12,431 entries.
--
-- Separate from changesets, which groups contributions awaiting review: a sync
-- run writes versions with no contribution behind them.
--
-- Additive only. Every column added to entity_versions is nullable, so existing
-- writers keep working untouched.

CREATE TABLE IF NOT EXISTS change_batches (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  title text NOT NULL,
  description text,
  initiated_by text,
  version_count integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_change_batches_started_at ON change_batches (started_at);
CREATE INDEX IF NOT EXISTS idx_change_batches_source_type ON change_batches (source_type);

ALTER TABLE entity_versions ADD COLUMN IF NOT EXISTS batch_id text;
ALTER TABLE entity_versions ADD COLUMN IF NOT EXISTS entity_name text;
ALTER TABLE entity_versions ADD COLUMN IF NOT EXISTS entity_slug text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_versions_batch_id_change_batches_id_fk'
  ) THEN
    ALTER TABLE entity_versions
      ADD CONSTRAINT entity_versions_batch_id_change_batches_id_fk
      FOREIGN KEY (batch_id) REFERENCES change_batches (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial: batch_id is NULL for every row written before batching, and stays
-- NULL for any version not part of a grouped operation. Indexing those adds
-- nothing a query would use.
CREATE INDEX IF NOT EXISTS idx_ev_batch ON entity_versions (batch_id) WHERE batch_id IS NOT NULL;
