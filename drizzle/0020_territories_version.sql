-- territories is the only contributable entity type without a version column,
-- so it has no optimistic concurrency: two contributors editing the same
-- territory could not detect each other, and the second edit would silently
-- overwrite the first.
--
-- Every other contributable type (utilities, power_plants, substations,
-- transmission_lines, pricing_nodes, programs, ev_stations, regions, isos,
-- rtos, balancing_authorities) already has it.

ALTER TABLE territories ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
