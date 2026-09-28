-- A historical database can lack the uniqueness declared in migration 0001.
-- The boundary publisher needs this exact key for ON CONFLICT inference.
-- Reconcile additively: never delete, merge, or renumber spatial history.
DO $$
BEGIN
  -- Bound lock acquisition so a busy database fails deployment, not requests.
  SET LOCAL lock_timeout = '5s';
  LOCK TABLE public.entity_geometry_versions IN SHARE ROW EXCLUSIVE MODE;

  -- PostgreSQL cannot use a matching deferrable constraint as an arbiter,
  -- even if another immediate index exists. Do not silently change semantics.
  IF EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.entity_geometry_versions'::regclass
      AND i.indisunique AND NOT i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 3
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, pos)
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
           WHERE k.pos <= i.indnkeyatts)
          = ARRAY['entity_id', 'entity_type', 'version_number']::text[]
  ) THEN
    RAISE EXCEPTION 'Geometry history has a deferrable version key; review the constraint before retrying migration 0037';
  END IF;

  -- Accept equivalent usable indexes regardless of name or column order.
  -- Partial, expression, invalid and non-unique indexes do not satisfy the key.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.entity_geometry_versions'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 3
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, pos)
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
           WHERE k.pos <= i.indnkeyatts)
          = ARRAY['entity_id', 'entity_type', 'version_number']::text[]
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.entity_geometry_versions
      GROUP BY entity_type, entity_id, version_number HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicate geometry history version keys; no history changed. Reconcile through a reviewed migration before retrying 0037';
    END IF;

    ALTER TABLE public.entity_geometry_versions
      ADD CONSTRAINT entity_geometry_versions_version_key
      UNIQUE (entity_type, entity_id, version_number);
  END IF;
END $$;
