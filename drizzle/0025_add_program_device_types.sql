-- CG-258: add a first-class Device Type dimension to programs.
--
-- Programs already carry asset_types (what kind of load/asset participates).
-- device_types is orthogonal: it records the control mechanism used to engage
-- that asset — a communicating smart device vs a utility-installed load
-- management switch. The same asset type (e.g. a Heating & Cooling load) can be
-- enrolled either way, and the programs differ meaningfully.
--
-- Values mirror the DeviceType enum in types/programs.ts
-- (LOAD_MANAGEMENT_SWITCH, SMART_DEVICE), matching the "Device Type" column in
-- the source Programs dataset ("Load Management Switch" / "Device").
--
-- JSONB array (like asset_types) so a program may declare more than one control
-- mechanism. GIN index mirrors idx_programs_asset_types for containment
-- filtering (?deviceType=...). Idempotent so re-runs and the seed stay in sync.

ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "device_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_programs_device_types" ON "programs" USING GIN("device_types");--> statement-breakpoint

-- Register program.device_types as a community-editable multi_enum field so it
-- is authorable in Suggest Edit / /programs/new and approvable through the
-- column-guarded write path. Options mirror the DeviceType enum in
-- types/programs.ts (guarded by the enum-subset test) and are backed by the
-- real column added above (guarded by the schema-drift test, CG-255).
-- Idempotent: ON CONFLICT keeps re-runs and the full re-seed in sync.
INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'device_types', 'multi_enum', true, 'Device Types', jsonb_build_object('enum', ARRAY['LOAD_MANAGEMENT_SWITCH','SMART_DEVICE']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;
