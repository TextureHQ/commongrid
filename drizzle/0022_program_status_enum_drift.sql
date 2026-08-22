-- Fix enum drift between community_editable_fields and the TypeScript enums.
--
-- Root cause: the community-editable field definitions declared enum option
-- lists as free-standing string literals, with nothing asserting them against
-- the TypeScript enums they mirror. `program.status` offered
-- ['active','enrolling','full','paused','ended'] while ProgramStatus is
-- { DRAFT, ACTIVE, PAUSED, FULL, ARCHIVED } — wrong case, two members that do
-- not exist, two real members missing.
--
-- A contributor picked the lowercase option on 2026-08-17, the submission
-- auto-approved, and production was left with 607 programs at 'ACTIVE' and one
-- at 'active'. Because `?status=` matches exactly, neither value returned the
-- correct set: status=ACTIVE returned 4 of Vermont Electric Co-op's 5 programs,
-- status=active returned the other 1.
--
-- `utility.segment` and `utility.status` had the same defect and were one
-- community edit away from the same outcome. `power_plant.status` is genuinely
-- lowercase in the database and is deliberately left lowercase here.
--
-- The durable fixes are in application code: the option lists are now derived
-- from the TS enums (lib/community-editable-fields/definitions.ts), submitted
-- enum values are validated server-side on write, and a test fails CI on drift.
-- This migration repairs the existing rows.

-- 1. Normalize any program status that differs from a ProgramStatus member only
--    by case. Written as a general rule rather than pinned to the one known
--    slug so it also repairs any row written between this fix and deploy.
UPDATE programs
SET status = upper(status),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND status IS NOT NULL
  AND status <> upper(status)
  AND upper(status) IN ('DRAFT', 'ACTIVE', 'PAUSED', 'FULL', 'ARCHIVED');

-- 2. program.status options -> ProgramStatus.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', to_jsonb(ARRAY['DRAFT', 'ACTIVE', 'PAUSED', 'FULL', 'ARCHIVED']))
WHERE entity_type = 'program'
  AND field_name = 'status';

-- 3. utility.segment options -> UtilitySegment.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object(
  'enum',
  to_jsonb(ARRAY[
    'DISTRIBUTION_COOPERATIVE',
    'GENERATION_AND_TRANSMISSION',
    'INVESTOR_OWNED_UTILITY',
    'MUNICIPAL_UTILITY',
    'COMMUNITY_CHOICE_AGGREGATOR',
    'POLITICAL_SUBDIVISION',
    'TRANSMISSION_OPERATOR',
    'JOINT_ACTION_AGENCY',
    'FEDERAL'
  ])
)
WHERE entity_type = 'utility'
  AND field_name = 'segment';

-- 4. utility.status options -> UtilityStatus.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', to_jsonb(ARRAY['ACTIVE', 'MERGED', 'ACQUIRED', 'DEFUNCT', 'PENDING']))
WHERE entity_type = 'utility'
  AND field_name = 'status';

-- 5. power_plant.status keeps its lowercase domain. Restated (unchanged values)
--    so the row matches the seed definitions exactly and a future reader does
--    not "helpfully" uppercase it to match the others.
UPDATE community_editable_fields
SET validation_rules = jsonb_build_object('enum', to_jsonb(ARRAY['operable', 'proposed', 'retired']))
WHERE entity_type = 'power_plant'
  AND field_name = 'status';

-- 6. Record the invariant on the table itself.
COMMENT ON TABLE community_editable_fields IS
  'Whitelist of community-editable fields. For field_type=''enum'', validation_rules->''enum'' must exactly match the corresponding TypeScript enum in lib/community-editable-fields/definitions.ts, which is the source of truth. Some domains (power_plant.status) are genuinely lowercase and are not TypeScript enums.';
