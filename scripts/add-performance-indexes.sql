-- Performance Optimization: Add Missing Indexes
-- These indexes optimize the most common filter and search patterns

-- EV Stations: City index (common filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ev_city ON ev_stations(city);

-- Analyze tables after adding indexes to update query planner statistics
ANALYZE power_plants;
ANALYZE ev_stations;
ANALYZE utilities;
ANALYZE transmission_lines;
