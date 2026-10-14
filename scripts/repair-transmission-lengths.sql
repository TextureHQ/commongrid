-- Run only through repair-transmission-lengths.yml after migration 0041.
-- Atomic and idempotent. Backup rows prevent overwriting later edits on reruns.
BEGIN;
LOCK TABLE transmission_lines IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE repair_lengths ON COMMIT DROP AS
SELECT t.id FROM transmission_lines t
WHERE NOT EXISTS (SELECT 1 FROM transmission_length_repair_0041 b WHERE b.id = t.id);
INSERT INTO transmission_length_repair_0041
SELECT t.id, t.length_miles, t.version FROM transmission_lines t JOIN repair_lengths r USING (id);
UPDATE transmission_lines
SET length_miles = CASE WHEN geometry IS NULL OR ST_IsEmpty(geometry) THEN NULL
                       ELSE ST_Length(geometry::geography, false) / 1609.344 END,
    updated_at = NOW(), version = version + 1
WHERE id IN (SELECT id FROM repair_lengths);
COMMIT;
