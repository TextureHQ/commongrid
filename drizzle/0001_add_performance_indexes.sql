-- Migration: Add performance indexes for full-text search and spatial queries
-- Created: 2026-04-15
-- Purpose: Improve API response times by adding missing GIN, trigram, and spatial indexes

-- Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Power Plants: Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_pp_search ON power_plants USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_pp_name_trgm ON power_plants USING GIN(name gin_trgm_ops);

-- Power Plants: Spatial indexes
CREATE INDEX IF NOT EXISTS idx_pp_geography ON power_plants USING GIST(geography);
CREATE INDEX IF NOT EXISTS idx_pp_geography_nd ON power_plants USING SPGIST(geography);
CREATE INDEX IF NOT EXISTS idx_pp_geometry ON power_plants USING GIST(geometry);

-- EV Stations: Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_ev_search ON ev_stations USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_ev_name_trgm ON ev_stations USING GIN(station_name gin_trgm_ops);

-- EV Stations: Spatial indexes
CREATE INDEX IF NOT EXISTS idx_ev_geography ON ev_stations USING GIST(geography);
CREATE INDEX IF NOT EXISTS idx_ev_geography_nd ON ev_stations USING SPGIST(geography);
CREATE INDEX IF NOT EXISTS idx_ev_geometry ON ev_stations USING GIST(geometry);

-- EV Stations: Additional filter indexes
CREATE INDEX IF NOT EXISTS idx_ev_city ON ev_stations USING btree(city);

-- Utilities: Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_utilities_search ON utilities USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_utilities_name_trgm ON utilities USING GIN(name gin_trgm_ops);

-- Transmission Lines: Trigram index for owner search
CREATE INDEX IF NOT EXISTS idx_tl_owner_trgm ON transmission_lines USING GIN(owner gin_trgm_ops);

-- Pricing Nodes: Spatial indexes
CREATE INDEX IF NOT EXISTS idx_pn_geography ON pricing_nodes USING GIST(geography);
CREATE INDEX IF NOT EXISTS idx_pn_geography_nd ON pricing_nodes USING SPGIST(geography);
CREATE INDEX IF NOT EXISTS idx_pn_geometry ON pricing_nodes USING GIST(geometry);

-- Programs: Full-text search index (if search_vector exists)
-- CREATE INDEX IF NOT EXISTS idx_programs_search ON programs USING GIN(search_vector);

-- Territories: Spatial indexes (geometry only, no point data)
-- CREATE INDEX IF NOT EXISTS idx_territories_geometry ON territories USING GIST(geometry);

-- Add ANALYZE to update query planner statistics after index creation
ANALYZE power_plants;
ANALYZE ev_stations;
ANALYZE utilities;
ANALYZE transmission_lines;
ANALYZE pricing_nodes;
