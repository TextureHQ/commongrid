-- Register upstream sources for the BA and CCA sync scripts (CG-337).
-- applySync writes entity_versions rows with source_id FKs, so the source rows
-- must exist before the scripts can publish.
INSERT INTO "data_sources" ("id", "display_name", "authority_tier", "cadence", "homepage_url") VALUES
  ('hifld-control-areas', 'HIFLD Control Areas', 'federal', 'irregular', 'https://hifld-geoplatform.opendata.arcgis.com/datasets/geoplatform::control-areas'),
  ('cec-el-other', 'CEC Electric Load Serving Entities (Other)', 'state', 'irregular', 'https://cecgis-caenergy.opendata.arcgis.com/datasets/CAEnergy::electric-load-serving-entities-other')
ON CONFLICT ("id") DO NOTHING;
