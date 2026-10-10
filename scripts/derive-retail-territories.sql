-- Build-only working tables; NEVER change as-filed territories or utility classification.
-- Run in one transaction/session. All objects disappear at commit/rollback.
CREATE TEMP TABLE retail_candidates ON COMMIT DROP AS
SELECT u.id, u.slug, u.name, u.segment, u.customer_count, u.ba_code, u.eia_id,
       t.id AS territory_id, t.source, t.source_url,
       r.state,
       ST_Multi(ST_CollectionExtract(ST_MakeValid(t.geography::geometry), 3)) AS geom
FROM utilities u
JOIN territories t ON t.region_id = u.service_territory_id
JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL
WHERE u.deleted_at IS NULL AND t.deleted_at IS NULL AND u.status = 'ACTIVE'
  AND u.segment IN ('INVESTOR_OWNED_UTILITY', 'DISTRIBUTION_COOPERATIVE',
                    'MUNICIPAL_UTILITY', 'POLITICAL_SUBDIVISION')
  -- DOE power marketing administrations: exclude their marketing footprints,
  -- without changing organization records. IDs from the existing EIA crosswalk.
  AND COALESCE(u.eia_id, '') NOT IN ('27000', '1738')
  AND t.geography IS NOT NULL;

ALTER TABLE retail_candidates ADD COLUMN area_m2 double precision;
ALTER TABLE retail_candidates ADD COLUMN ambiguous boolean NOT NULL DEFAULT false;
UPDATE retail_candidates SET area_m2 = ST_Area(geom::geography);
DELETE FROM retail_candidates WHERE ST_IsEmpty(geom) OR area_m2 <= 0;
CREATE INDEX ON retail_candidates USING gist (geom);
ANALYZE retail_candidates;

-- Equal geometries across different utilities have no defensible winner.
UPDATE retail_candidates a SET ambiguous = true
WHERE EXISTS (SELECT 1 FROM retail_candidates b
              WHERE a.id <> b.id AND a.geom && b.geom AND ST_Equals(a.geom, b.geom));

CREATE TEMP TABLE retail_exclusive ON COMMIT DROP AS
SELECT a.*, ST_Multi(ST_CollectionExtract(
  CASE WHEN cutters.geom IS NULL THEN a.geom
       ELSE ST_Difference(a.geom, cutters.geom) END, 3)) AS retail_geom
FROM retail_candidates a
LEFT JOIN LATERAL (
  SELECT ST_UnaryUnion(ST_Collect(b.geom)) AS geom
  FROM retail_candidates b
  WHERE b.geom && a.geom AND ST_Intersects(a.geom, b.geom)
    AND (b.ambiguous OR (b.area_m2, b.id, b.territory_id) < (a.area_m2, a.id, a.territory_id))
) cutters ON true
WHERE NOT a.ambiguous;

CREATE INDEX ON retail_exclusive USING gist (retail_geom);
ANALYZE retail_exclusive;
