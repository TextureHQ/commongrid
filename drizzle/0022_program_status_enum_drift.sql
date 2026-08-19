-- Fix enum drift between community_editable_fields and TypeScript enums.
--
-- Root cause: scripts/seed-editable-fields.ts declared option lists that
-- matched an older/lowercase schema for some fields. After TS enum
-- normalization, several fields drifted, allowing stale values to be written
-- (and auto-approved).
--
-- This migration does three things:
--   1. Normalizes the one known bad program status value.
--   2. Updates community_editable_fields option lists to match TS enums.
--   3. Adds a comment on the table documenting the validation invariant.

-- 1. Normalize the lowercase program status that slipped through.
UPDATE programs
SET status = 'ACTIVE',
    updated_at = NOW()
WHERE status = 'active'
  AND slug = 'flexible-load-bring-your-own-battery'
  AND deleted_at IS NULL;

-- 2. Sync program status options to ProgramStatus enum.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', ARRAY['DRAFT','ACTIVE','PAUSED','FULL','ARCHIVED'])
WHERE entity_type = 'program'
  AND field_name = 'status';

-- 3. Sync utility segment options to UtilitySegment enum.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object(
  'enum',
  ARRAY[
    'INVESTOR_OWNED_UTILITY',
    'DISTRIBUTION_COOPERATIVE',
    'GENERATION_AND_TRANSMISSION',
    'MUNICIPAL_UTILITY',
    'COMMUNITY_CHOICE_AGGREGATOR',
    'POLITICAL_SUBDIVISION',
    'TRANSMISSION_OPERATOR',
    'JOINT_ACTION_AGENCY',
    'FEDERAL'
  ]
)
WHERE entity_type = 'utility'
  AND field_name = 'segment';

-- 4. Sync utility status options to UtilityStatus enum.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', ARRAY['ACTIVE','MERGED','ACQUIRED','DEFUNCT','PENDING'])
WHERE entity_type = 'utility'
  AND field_name = 'status';

-- 5. Sync power plant status options to the actual DB domain and TS type.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', ARRAY['operable','proposed'])
WHERE entity_type = 'power_plant'
  AND field_name = 'status';

-- 6. Add a table comment documenting the invariant (TS enum is source of truth).
COMMENT ON TABLE community_editable_fields IS
  'Whitelist of community-editable fields. For field_type=''enum'', validation_rules->''enum'' must be a subset of the corresponding TypeScript enum. TypeScript enums are the source of truth.';
