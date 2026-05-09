-- Migration: remove the "internal" API surface and move the still-useful
-- resolver tables/function into public.*.
--
-- Background
-- ----------
-- CommonGrid is a public open-source project. Previous migrations (0007,
-- 0008, 0009, 0010, 0011) introduced a private `commongrid.*` schema and a
-- Postgres role (`internal_api_consumer`) that were intended as a
-- server-to-server contract surface scoped only to certain callers. That
-- design was mistaken: a public open-source project should not carry
-- private, caller-scoped database objects. Every object in this repo is
-- meant to be useful to any developer, researcher, or journalist building
-- on US grid data.
--
-- This migration unwinds that surface. It:
--
--   1. Recreates the resolver tables in `public.*` so they're first-class
--      public primitives, readable like any other CommonGrid table:
--        - public.utility_resolver_cache
--        - public.utility_name_manual_overrides
--      (Column shape and indexes mirror the previous commongrid.* copies.
--      Data is migrated over before the old schema is dropped.)
--
--   2. Rebuilds `public.fn_resolve_utility_by_name` and its helper
--      `public.normalize_utility_name` against the new public tables. The
--      functions stay SECURITY INVOKER with a pinned `search_path = public`
--      and no EXECUTE grants to any special role — callers reach them
--      through the normal public DB path or, more typically, through the
--      public `POST /api/v1/utilities/resolve` HTTP endpoint.
--
--   3. Drops the private namespace:
--        - DROP FUNCTION commongrid.fn_resolve_utility_by_name
--        - DROP TABLE    commongrid.utility_resolver_cache
--        - DROP TABLE    commongrid.utility_name_manual_overrides
--        - DROP TABLE    commongrid.enrichment_schema
--        - DROP SCHEMA   commongrid CASCADE
--        - DROP ROLE     internal_api_consumer (and its login user)
--
-- Idempotency
-- -----------
-- Every statement uses IF EXISTS / CREATE IF NOT EXISTS / OR REPLACE so the
-- migration can be re-applied safely and tolerates environments where
-- some of the older migrations never ran or only partially ran.
--
-- Deploy order
-- ------------
-- CommonGrid CI does NOT auto-apply migrations. A maintainer applies this
-- against the Neon database manually after merge. See the PR description
-- "Deploy steps (post-merge)" section for the exact command sequence.

BEGIN;

-- ============================================================================
-- 1. Move tables to public.*
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.utility_name_manual_overrides (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  utility_id  TEXT        NOT NULL UNIQUE REFERENCES public.utilities(id) ON DELETE CASCADE,
  search_name TEXT        NOT NULL UNIQUE, -- normalized: lowercase, alphanumeric + space
  description TEXT,                        -- notes on why this override exists
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utility_name_manual_overrides_utility_id
  ON public.utility_name_manual_overrides (utility_id);

CREATE INDEX IF NOT EXISTS idx_utility_name_manual_overrides_search_name
  ON public.utility_name_manual_overrides (search_name);

CREATE TABLE IF NOT EXISTS public.utility_resolver_cache (
  cache_key        TEXT        PRIMARY KEY,
  utility_id       TEXT        UNIQUE REFERENCES public.utilities(id) ON DELETE CASCADE,
  match_result     JSONB       NOT NULL,
  resolver_version TEXT        NOT NULL DEFAULT '1.0.0',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utility_resolver_cache_utility_id
  ON public.utility_resolver_cache (utility_id);

-- Hot-cache index: order by created_at DESC. Earlier drafts of this
-- migration tried to make this a partial index with WHERE created_at > NOW() - INTERVAL '30 days',
-- but Postgres rejects non-IMMUTABLE functions (like NOW()) in index predicates,
-- which caused the migration to abort mid-transaction and leave the
-- resolver function uncreated in prod. A plain btree on created_at is
-- sufficient for the cache's access patterns; stale-entry pruning lives
-- in the application layer, not the index predicate.
CREATE INDEX IF NOT EXISTS idx_utility_resolver_cache_created_at
  ON public.utility_resolver_cache (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_utility_resolver_cache_match_source
  ON public.utility_resolver_cache ((match_result ->> 'match_source'));

-- Copy over any data that landed in the commongrid.* copies before
-- dropping them. These INSERTs are defensive: if the `commongrid` schema
-- was never created in this environment, skip them silently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'commongrid' AND table_name = 'utility_name_manual_overrides'
  ) THEN
    INSERT INTO public.utility_name_manual_overrides (id, utility_id, search_name, description, created_at, updated_at)
    SELECT id, utility_id, search_name, description, created_at, updated_at
      FROM commongrid.utility_name_manual_overrides
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'commongrid' AND table_name = 'utility_resolver_cache'
  ) THEN
    INSERT INTO public.utility_resolver_cache (cache_key, utility_id, match_result, resolver_version, created_at, updated_at)
    SELECT cache_key, utility_id, match_result, resolver_version, created_at, updated_at
      FROM commongrid.utility_resolver_cache
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 2. Rebuild the resolver function against public.* tables
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_utility_name(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(p_name, '\s+', ' ', 'g'),
      '[^a-z0-9\s]', '', 'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.fn_resolve_utility_by_name(
  p_name TEXT,
  p_state TEXT DEFAULT NULL,
  p_confidence_threshold NUMERIC DEFAULT 0.85
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET client_min_messages = WARNING
AS $$
DECLARE
  v_normalized_name TEXT;
  v_match_record RECORD;
  v_candidates JSONB[];
  v_candidate_count INT := 0;
  v_match_source TEXT;
  v_confidence NUMERIC;
BEGIN
  v_normalized_name := public.normalize_utility_name(p_name);

  IF v_normalized_name IS NULL OR v_normalized_name = '' THEN
    RETURN jsonb_build_object(
      'eia_id', NULL,
      'confidence', 0,
      'match_source', 'error:empty_name',
      'candidates', jsonb_build_array(),
      'resolver_version', '1.0.0'
    );
  END IF;

  -- PHASE 1: manual override
  SELECT
    u.eia_id AS id,
    u.segment,
    u.jurisdiction AS state,
    u.name
  INTO v_match_record
  FROM public.utility_name_manual_overrides m
  JOIN public.utilities u ON m.utility_id = u.id
  WHERE m.search_name = v_normalized_name
    AND (p_state IS NULL OR u.jurisdiction = p_state)
    AND u.deleted_at IS NULL
    AND u.status = 'ACTIVE'
    AND u.eia_id IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'eia_id', v_match_record.id,
      'confidence', 1.0,
      'match_source', 'override',
      'candidates', jsonb_build_array(
        jsonb_build_object(
          'eia_id', v_match_record.id,
          'name', v_match_record.name,
          'segment', v_match_record.segment,
          'state', v_match_record.state,
          'match_score', 1.0
        )
      ),
      'resolver_version', '1.0.0'
    );
  END IF;

  -- PHASE 2: exact normalized name
  SELECT
    u.eia_id AS id,
    u.segment,
    u.jurisdiction AS state,
    u.name
  INTO v_match_record
  FROM public.utilities u
  WHERE public.normalize_utility_name(u.name) = v_normalized_name
    AND (p_state IS NULL OR u.jurisdiction = p_state)
    AND u.deleted_at IS NULL
    AND u.status = 'ACTIVE'
    AND u.eia_id IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    v_confidence := 0.95;
    RETURN jsonb_build_object(
      'eia_id', v_match_record.id,
      'confidence', v_confidence,
      'match_source', 'exact',
      'candidates', jsonb_build_array(
        jsonb_build_object(
          'eia_id', v_match_record.id,
          'name', v_match_record.name,
          'segment', v_match_record.segment,
          'state', v_match_record.state,
          'match_score', v_confidence
        )
      ),
      'resolver_version', '1.0.0'
    );
  END IF;

  -- PHASE 3: domain-based match when input looks like an email
  IF p_name ~ '@' THEN
    SELECT
      u.eia_id AS id,
      u.segment,
      u.jurisdiction AS state,
      u.name
    INTO v_match_record
    FROM public.utilities u
    WHERE u.domains IS NOT NULL
      AND u.domains @> ARRAY[LOWER(SUBSTRING(p_name FROM '@(.+)$'))]
      AND (p_state IS NULL OR u.jurisdiction = p_state)
      AND u.deleted_at IS NULL
      AND u.status = 'ACTIVE'
    AND u.eia_id IS NOT NULL
    LIMIT 1;

    IF FOUND THEN
      v_confidence := 0.75;
      RETURN jsonb_build_object(
        'eia_id', v_match_record.id,
        'confidence', v_confidence,
        'match_source', 'domain',
        'candidates', jsonb_build_array(
          jsonb_build_object(
            'eia_id', v_match_record.id,
            'name', v_match_record.name,
            'segment', v_match_record.segment,
            'state', v_match_record.state,
            'match_score', v_confidence
          )
        ),
        'resolver_version', '1.0.0'
      );
    END IF;
  END IF;

  -- PHASE 4: trigram fuzzy
  FOR v_match_record IN
    SELECT
      u.eia_id AS id,
      SIMILARITY(public.normalize_utility_name(u.name), v_normalized_name) AS similarity_score,
      u.segment,
      u.jurisdiction AS state,
      u.name
    FROM public.utilities u
    WHERE public.normalize_utility_name(u.name) % v_normalized_name
      AND (p_state IS NULL OR u.jurisdiction = p_state)
      AND u.deleted_at IS NULL
      AND u.status = 'ACTIVE'
    AND u.eia_id IS NOT NULL
    ORDER BY similarity_score DESC
    LIMIT 5
  LOOP
    v_candidate_count := v_candidate_count + 1;
    v_candidates := v_candidates || ARRAY[
      jsonb_build_object(
        'eia_id', v_match_record.id,
        'name', v_match_record.name,
        'segment', v_match_record.segment,
        'state', v_match_record.state,
        'match_score', ROUND(v_match_record.similarity_score::NUMERIC, 3)
      )
    ];

    IF v_candidate_count = 1 AND v_match_record.similarity_score >= p_confidence_threshold THEN
      v_match_source := 'fuzzy';
      v_confidence := ROUND(v_match_record.similarity_score::NUMERIC, 3);
      RETURN jsonb_build_object(
        'eia_id', v_match_record.id,
        'confidence', v_confidence,
        'match_source', v_match_source,
        'candidates', COALESCE(to_jsonb(v_candidates), '[]'::jsonb),
        'resolver_version', '1.0.0'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'eia_id', NULL,
    'confidence', 0,
    'match_source', 'none',
    'candidates', COALESCE(to_jsonb(v_candidates), '[]'::jsonb),
    'resolver_version', '1.0.0'
  );
END;
$$;

COMMENT ON FUNCTION public.fn_resolve_utility_by_name(TEXT, TEXT, NUMERIC) IS
  'Resolve a free-form utility name (optionally scoped by state or appearing '
  'as an email-domain) to a canonical EIA utility id. Returns a JSONB envelope '
  '{eia_id, confidence, match_source, candidates[], resolver_version}. Match '
  'sources: override, exact, domain, fuzzy, none. Backs the public '
  'POST /api/v1/utilities/resolve endpoint.';

-- ============================================================================
-- 3. Drop the old trigger (it still points at the commongrid copy) and
--    reattach against public.utility_resolver_cache.
-- ============================================================================

DROP TRIGGER IF EXISTS trig_invalidate_resolver_cache_on_utility_change ON public.utilities;

CREATE OR REPLACE FUNCTION public.invalidate_resolver_cache_on_utility_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.utility_resolver_cache
  SET resolver_version = '0.9.9', updated_at = NOW()
  WHERE utility_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_invalidate_resolver_cache_on_utility_change
AFTER UPDATE ON public.utilities
FOR EACH ROW
  WHEN (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.jurisdiction IS DISTINCT FROM NEW.jurisdiction
    OR OLD.domains IS DISTINCT FROM NEW.domains
    OR OLD.status IS DISTINCT FROM NEW.status
  )
EXECUTE FUNCTION public.invalidate_resolver_cache_on_utility_change();

-- ============================================================================
-- 4. Drop the private schema, all its objects, and the consumer role.
-- ============================================================================

-- Functions that lived in commongrid.* (if any survived previous drops).
DROP FUNCTION IF EXISTS commongrid.fn_resolve_utility_by_name(TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS commongrid.normalize_utility_name(TEXT);
DROP FUNCTION IF EXISTS commongrid.invalidate_resolver_cache_on_utility_change();

-- Views (0010/0011 already dropped these, but be defensive).
DROP VIEW  IF EXISTS commongrid.v_utility_enrichment;
DROP VIEW  IF EXISTS commongrid.v_utilities_enriched;
DROP VIEW  IF EXISTS commongrid.v_crm_org_enrichment;

-- Tables.
DROP TABLE IF EXISTS commongrid.utility_resolver_cache;
DROP TABLE IF EXISTS commongrid.utility_name_manual_overrides;
DROP TABLE IF EXISTS commongrid.enrichment_schema;

-- Schema.
DROP SCHEMA IF EXISTS commongrid CASCADE;

-- Revoke any grants on the consumer role before dropping it; some
-- environments will refuse DROP ROLE while grants exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer') THEN
    -- Revoke from any objects the role might still touch. Wrapped in a
    -- block so missing objects don't abort the migration.
    BEGIN
      REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM internal_api_consumer;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM internal_api_consumer;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM internal_api_consumer;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- Drop the login user first (depends on the role), then the role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer_user') THEN
    EXECUTE 'DROP USER internal_api_consumer_user';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer') THEN
    EXECUTE 'DROP ROLE internal_api_consumer';
  END IF;
END $$;

COMMIT;
