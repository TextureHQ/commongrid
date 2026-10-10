-- Add V2G to the shared create/edit checkbox options and contribution validation.
-- Preserve every existing option and other validation rules. No program records
-- are reclassified: managed charging / demand response does not imply V2G.
UPDATE community_editable_fields
SET validation_rules = jsonb_set(
  COALESCE(validation_rules, '{}'::jsonb),
  '{enum}',
  COALESCE(validation_rules->'enum', '[]'::jsonb) || '["VEHICLE_TO_GRID"]'::jsonb
)
WHERE entity_type = 'program'
  AND field_name = 'grid_services'
  AND NOT COALESCE(validation_rules->'enum', '[]'::jsonb) @> '["VEHICLE_TO_GRID"]'::jsonb;

-- Rollback, if required: remove only VEHICLE_TO_GRID from this metadata enum
-- via a reviewed follow-up migration. Leave program records intact to preserve
-- contributor intent; reverting the UI alone does not remove stored values.
