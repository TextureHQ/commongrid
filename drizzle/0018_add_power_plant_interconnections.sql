-- Migration: Add power_plant_interconnections join table
-- Links power plants to their nearest substation(s) for interconnection analysis

CREATE TABLE IF NOT EXISTS power_plant_interconnections (
  power_plant_id TEXT NOT NULL,
  substation_id TEXT NOT NULL,
  distance_meters DOUBLE PRECISION NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,

  PRIMARY KEY (power_plant_id, substation_id),
  FOREIGN KEY (power_plant_id) REFERENCES power_plants(id) ON DELETE CASCADE,
  FOREIGN KEY (substation_id) REFERENCES substations(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pp_intercon_plant_id ON power_plant_interconnections(power_plant_id);
CREATE INDEX IF NOT EXISTS idx_pp_intercon_sub_id ON power_plant_interconnections(substation_id);
CREATE INDEX IF NOT EXISTS idx_pp_intercon_primary ON power_plant_interconnections(power_plant_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_pp_intercon_distance ON power_plant_interconnections(distance_meters);
