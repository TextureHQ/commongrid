-- Migration: Add transmission_line_endpoints join table
-- Links transmission lines to substations at their endpoints
-- Replaces fuzzy sub1/sub2 strings with formal foreign keys

CREATE TABLE IF NOT EXISTS transmission_line_endpoints (
  transmission_line_id TEXT NOT NULL,
  substation_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'from' | 'to'
  match_confidence DOUBLE PRECISION, -- 0..1, NULL if manual/verified

  PRIMARY KEY (transmission_line_id, substation_id, role),
  FOREIGN KEY (transmission_line_id) REFERENCES transmission_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (substation_id) REFERENCES substations(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_tl_endpoints_tl_id ON transmission_line_endpoints(transmission_line_id);
CREATE INDEX idx_tl_endpoints_sub_id ON transmission_line_endpoints(substation_id);
CREATE INDEX idx_tl_endpoints_role ON transmission_line_endpoints(role);
CREATE INDEX idx_tl_endpoints_confidence ON transmission_line_endpoints(match_confidence) WHERE match_confidence < 0.9;
