-- Migration: Add utility_resolver_cache + utility_name_manual_overrides tables (M4)
-- Public server-to-server utility matching contract.
-- Creates two admin tables to support M3 fn_resolve_utility_by_name:
--   1. utility_name_manual_overrides: admin-curated mappings for ambiguous/new utilities
--   2. utility_resolver_cache: read-only cache keyed by sha256(lower(name)|state|domain)
-- Grants SELECT on cache to internal_api_consumer; no grants on overrides (admin-only)

-- ============================================================================
-- 1. utility_name_manual_overrides table (admin-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS utility_name_manual_overrides (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  utility_id TEXT NOT NULL UNIQUE REFERENCES utilities(id) ON DELETE CASCADE,
  search_name TEXT NOT NULL UNIQUE,  -- normalized name (lowercase, alphanumeric + space)
  description TEXT,  -- notes on why this override exists
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_utility_name_manual_overrides_utility_id
  ON utility_name_manual_overrides(utility_id);

CREATE INDEX idx_utility_name_manual_overrides_search_name
  ON utility_name_manual_overrides(search_name);

-- No grants on this table — admin use only
-- (internal_api_consumer can access it through fn_resolve_utility_by_name, but not directly)

-- ============================================================================
-- 2. utility_resolver_cache table (read-only for internal_api_consumer)
-- ============================================================================
CREATE TABLE IF NOT EXISTS utility_resolver_cache (
  cache_key TEXT PRIMARY KEY,  -- sha256(lower(name)|state|domain), deterministic
  utility_id TEXT UNIQUE REFERENCES utilities(id) ON DELETE CASCADE,
  match_result JSONB NOT NULL,  -- cached result from fn_resolve_utility_by_name
  resolver_version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_utility_resolver_cache_utility_id
  ON utility_resolver_cache(utility_id);

CREATE INDEX idx_utility_resolver_cache_created_at
  ON utility_resolver_cache(created_at DESC)
  WHERE created_at > NOW() - INTERVAL '30 days';  -- cache recency index

CREATE INDEX idx_utility_resolver_cache_match_source
  ON utility_resolver_cache((match_result ->> 'match_source'));

-- ============================================================================
-- 3. Grant SELECT on utility_resolver_cache to internal_api_consumer
-- ============================================================================
GRANT SELECT ON TABLE utility_resolver_cache TO internal_api_consumer;

-- Explicitly deny SELECT on manual_overrides to internal_api_consumer
-- (they access via function, not directly)
REVOKE ALL ON TABLE utility_name_manual_overrides FROM internal_api_consumer;

-- ============================================================================
-- 4. Triggers for automatic cache invalidation (optional, admin-managed)
-- ============================================================================
-- When a utility is updated, mark affected cache entries as stale
-- (Admin-only: do not grant trigger execute to internal_api_consumer)

CREATE OR REPLACE FUNCTION invalidate_resolver_cache_on_utility_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, commongrid
AS $$
BEGIN
  -- Soft-delete cache entries for this utility by setting resolver_version to outdated
  UPDATE utility_resolver_cache
  SET resolver_version = '0.9.9', updated_at = NOW()
  WHERE utility_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Attach trigger to utilities table (on UPDATE)
DROP TRIGGER IF EXISTS trig_invalidate_resolver_cache_on_utility_change ON utilities;
CREATE TRIGGER trig_invalidate_resolver_cache_on_utility_change
AFTER UPDATE ON utilities
FOR EACH ROW
  WHEN (
    -- Only trigger on meaningful updates (not timestamps)
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.domains IS DISTINCT FROM NEW.domains
    OR OLD.status IS DISTINCT FROM NEW.status
  )
EXECUTE FUNCTION invalidate_resolver_cache_on_utility_change();
