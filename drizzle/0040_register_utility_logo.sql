-- Register the existing public logo field without re-seeding unrelated fields.
-- Critical fields always require human moderation, including trusted users.
INSERT INTO community_editable_fields
  (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('utility', 'logo', 'url', true, 'Logo', NULL)
ON CONFLICT (entity_type, field_name) DO UPDATE
SET field_type = EXCLUDED.field_type,
    is_critical = true,
    display_name = EXCLUDED.display_name;
