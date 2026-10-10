-- Run after derive-retail-territories.sql in the same session.
-- Measures the actual export population (including AK), not the historical
-- ticket's lower-48-only sample. Areas in square metres, geodesic EPSG:4326.
WITH raw AS (
  SELECT sum(ST_Area(geom::geography)) AS area_sum,
         ST_Area(ST_UnaryUnion(ST_Collect(geom))::geography) AS area_union
  FROM retail_candidates
), derived AS (
  SELECT sum(ST_Area(retail_geom::geography)) AS area_sum,
         ST_Area(ST_UnaryUnion(ST_Collect(retail_geom))::geography) AS area_union
  FROM retail_exclusive
)
SELECT raw.area_sum / NULLIF(raw.area_union, 0) AS raw_overclaim_ratio,
       derived.area_sum / NULLIF(derived.area_union, 0) AS derived_overclaim_ratio,
       raw.area_union AS raw_union_m2, derived.area_union AS derived_union_m2,
       (SELECT jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'territoryId', territory_id)
                         ORDER BY id, territory_id)
        FROM retail_candidates WHERE ambiguous) AS ambiguous_records
FROM raw, derived;
