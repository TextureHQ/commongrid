-- CIR-1509: register program JSONB enum-array fields as community-editable.
--
-- Root cause: scripts/seed-editable-fields.ts only ever seeded scalar program
-- columns, so asset_types / market_segments / grid_services /
-- participation_models / incentive_structures were absent from
-- community_editable_fields. Both /programs/new and the Suggest Edit panel
-- build their forms from that table, and auto-approve eligibility fails closed
-- on unregistered fields, so these were unauthorable end to end.
--
-- field_type='multi_enum' pairs with the multi-select control added in
-- EntityFormFields/InlineFieldEdit. Options mirror the TypeScript enums in
-- types/programs.ts (guarded by the enum-subset test) and match the uppercase
-- values already stored in the programs table.
--
-- Idempotent: ON CONFLICT keeps re-runs and the full re-seed script in sync.

INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'asset_types', 'multi_enum', true, 'Asset Types', jsonb_build_object('enum', ARRAY['BATTERY','THERMOSTAT','EV_CHARGER','WATER_HEATER','HVAC','SOLAR_PV','POOL_PUMP','GENERATOR','IRRIGATION','INDUSTRIAL_LOAD','COMMERCIAL_LOAD','WHOLE_HOME','NON_DEVICE']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;

INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'market_segments', 'multi_enum', false, 'Market Segments', jsonb_build_object('enum', ARRAY['RESIDENTIAL','COMMERCIAL','INDUSTRIAL','AGRICULTURAL','GOVERNMENT']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;

INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'grid_services', 'multi_enum', true, 'Grid Services', jsonb_build_object('enum', ARRAY['DEMAND_RESPONSE','PEAK_SHAVING','LOAD_SHIFTING','FREQUENCY_REGULATION','DISTRIBUTION_VOLTAGE_SUPPORT','DISTRIBUTION_CAPACITY_SUPPORT','CAPACITY','TRANSMISSION','ENERGY_ARBITRAGE','RENEWABLE_INTEGRATION','LOAD_FLEXIBILITY','DEMAND_CHARGE_REDUCTION']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;

INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'participation_models', 'multi_enum', false, 'Participation', jsonb_build_object('enum', ARRAY['DIRECT_CONTROL','SELF_DISPATCH','EVENT_BASED','SCHEDULED','AGGREGATOR_MANAGED','AUTOMATED','CONTINUOUS']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;

INSERT INTO community_editable_fields (entity_type, field_name, field_type, is_critical, display_name, validation_rules)
VALUES ('program', 'incentive_structures', 'multi_enum', false, 'Incentive Structures', jsonb_build_object('enum', ARRAY['REBATE','BILL_CREDIT','RATE_DISCOUNT','DIRECT_PAYMENT','CAPACITY_PAYMENT','PERFORMANCE_BASED','TAX_CREDIT','LOAN','NONE']))
ON CONFLICT (entity_type, field_name) DO UPDATE
  SET field_type = EXCLUDED.field_type,
      is_critical = EXCLUDED.is_critical,
      display_name = EXCLUDED.display_name,
      validation_rules = EXCLUDED.validation_rules;
