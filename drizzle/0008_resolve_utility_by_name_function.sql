-- Migration: Add fn_resolve_utility_by_name SQL function (M3)
-- Spec: TextureHQ/mono#10142 (specs/relay/commongrid-nisc-matcher.md)
-- SECURITY INVOKER function with pinned search_path
-- Implements: override-lookup → exact normalized name → domain match → trigram fuzzy cascade
-- Returns: contract JSONB with {eia_id, confidence, match_source, candidates[top 5], resolver_version}
-- Filters: deleted_at IS NULL, status='active', state when provided
-- CI test: regex over pg_proc.prosrc asserts no INSERT/UPDATE/DELETE/COPY in body

-- ============================================================================
-- 1. Helper function: normalize_utility_name (idempotent)
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_utility_name(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SECURITY DEFINER
SET search_path = public, commongrid
AS $$
  SELECT LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(p_name, '\s+', ' ', 'g'),  -- collapse whitespace
      '[^a-z0-9\s]', '', 'g'  -- remove non-alphanumeric
    )
  )
$$;

-- ============================================================================
-- 2. Main resolver function: fn_resolve_utility_by_name
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_resolve_utility_by_name(
  p_name TEXT,
  p_state TEXT DEFAULT NULL,
  p_confidence_threshold NUMERIC DEFAULT 0.85
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, commongrid
SET client_min_messages = WARNING
AS $$
DECLARE
  v_normalized_name TEXT;
  v_match_record RECORD;
  v_candidates JSONB[];
  v_candidate_count INT := 0;
  v_result JSONB;
  v_match_source TEXT;
  v_confidence NUMERIC;
BEGIN
  -- Normalize input
  v_normalized_name := normalize_utility_name(p_name);

  IF v_normalized_name IS NULL OR v_normalized_name = '' THEN
    RETURN jsonb_build_object(
      'eia_id', NULL,
      'confidence', 0,
      'match_source', 'error:empty_name',
      'candidates', jsonb_build_array(),
      'resolver_version', '1.0.0'
    );
  END IF;

  -- ======================================================================
  -- PHASE 1: Check utility_name_manual_overrides (fastest path)
  -- ======================================================================
  SELECT
    u.id,
    1.0 AS confidence,
    'override_match' AS match_source,
    u.segment,
    u.state,
    u.name
  INTO v_match_record
  FROM utility_name_manual_overrides m
  JOIN utilities u ON m.utility_id = u.id
  WHERE m.search_name = v_normalized_name
    AND (p_state IS NULL OR u.state = p_state)
    AND u.deleted_at IS NULL
    AND u.status = 'ACTIVE'
  LIMIT 1;

  IF FOUND THEN
    v_match_source := 'override_match';
    v_confidence := 1.0;
    RETURN jsonb_build_object(
      'eia_id', v_match_record.id,
      'confidence', v_confidence,
      'match_source', v_match_source,
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

  -- ======================================================================
  -- PHASE 2: Exact normalized name match (2nd fastest)
  -- ======================================================================
  SELECT
    u.id,
    0.95 AS confidence,
    'exact_name_match' AS match_source,
    u.segment,
    u.state,
    u.name
  INTO v_match_record
  FROM utilities u
  WHERE normalize_utility_name(u.name) = v_normalized_name
    AND (p_state IS NULL OR u.state = p_state)
    AND u.deleted_at IS NULL
    AND u.status = 'ACTIVE'
  LIMIT 1;

  IF FOUND THEN
    v_match_source := 'exact_name_match';
    v_confidence := 0.95;
    RETURN jsonb_build_object(
      'eia_id', v_match_record.id,
      'confidence', v_confidence,
      'match_source', v_match_source,
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

  -- ======================================================================
  -- PHASE 3: Domain-based match (for domain-specific queries)
  -- ======================================================================
  IF p_name ~ '@' THEN  -- looks like email domain or URL
    SELECT
      u.id,
      0.75 AS confidence,
      'domain_match' AS match_source,
      u.segment,
      u.state,
      u.name
    INTO v_match_record
    FROM utilities u
    WHERE u.domains IS NOT NULL
      AND u.domains @> ARRAY[LOWER(SUBSTRING(p_name FROM '@' + 1))]  -- contains domain part
      AND (p_state IS NULL OR u.state = p_state)
      AND u.deleted_at IS NULL
      AND u.status = 'ACTIVE'
    LIMIT 1;

    IF FOUND THEN
      v_match_source := 'domain_match';
      v_confidence := 0.75;
      RETURN jsonb_build_object(
        'eia_id', v_match_record.id,
        'confidence', v_confidence,
        'match_source', v_match_source,
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

  -- ======================================================================
  -- PHASE 4: Trigram fuzzy match (slowest but most forgiving)
  -- ======================================================================
  FOR v_match_record IN
    SELECT
      u.id,
      SIMILARITY(normalize_utility_name(u.name), v_normalized_name) AS similarity_score,
      u.segment,
      u.state,
      u.name
    FROM utilities u
    WHERE normalize_utility_name(u.name) % v_normalized_name  -- trigram ILIKE
      AND (p_state IS NULL OR u.state = p_state)
      AND u.deleted_at IS NULL
      AND u.status = 'ACTIVE'
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

    -- Take first match above threshold
    IF v_candidate_count = 1 AND v_match_record.similarity_score >= p_confidence_threshold THEN
      v_match_source := 'fuzzy_match';
      v_confidence := ROUND(v_match_record.similarity_score::NUMERIC, 3);
      RETURN jsonb_build_object(
        'eia_id', v_match_record.id,
        'confidence', v_confidence,
        'match_source', v_match_source,
        'candidates', v_candidates::JSONB,
        'resolver_version', '1.0.0'
      );
    END IF;
  END LOOP;

  -- ======================================================================
  -- No match found above threshold
  -- ======================================================================
  RETURN jsonb_build_object(
    'eia_id', NULL,
    'confidence', 0,
    'match_source', 'no_match',
    'candidates', v_candidates::JSONB,
    'resolver_version', '1.0.0'
  );
END;
$$;

-- ============================================================================
-- 3. Grant permissions to internal_api_consumer
-- ============================================================================
GRANT EXECUTE ON FUNCTION fn_resolve_utility_by_name(TEXT, TEXT, NUMERIC) TO internal_api_consumer;
GRANT EXECUTE ON FUNCTION normalize_utility_name(TEXT) TO internal_api_consumer;

-- NOTE: M4 will create utility_name_manual_overrides and utility_resolver_cache tables
-- and grant SELECT permissions. The function above will work once those tables exist.
