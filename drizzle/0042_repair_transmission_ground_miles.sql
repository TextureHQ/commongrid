-- CG-356. HIFLD Shape__Length is EPSG:3857 map metres, not degrees.
-- Measure WGS84 geometry on the PostGIS sphere; divide metres by 1609.344.
-- Retain only the changed fields for a reviewed rollback; no private data.
CREATE TABLE transmission_length_repair_0041 AS
SELECT id, length_miles, version FROM transmission_lines WITH NO DATA;
--> statement-breakpoint
ALTER TABLE transmission_lines ALTER COLUMN length_miles DROP NOT NULL;
