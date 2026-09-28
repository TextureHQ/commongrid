-- Standalone regression test for migration 0028 against minimal pre-migration
-- version tables. Run ONLY in a disposable local PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f scripts/__tests__/data-source-provenance.sql
-- All test objects and changes are rolled back.
BEGIN;
CREATE SCHEMA cg286_migration_test;
SET LOCAL search_path TO cg286_migration_test;
CREATE TABLE entity_versions (id bigint PRIMARY KEY);
CREATE TABLE entity_geometry_versions (id bigint PRIMARY KEY);
INSERT INTO entity_versions VALUES (1);
INSERT INTO entity_geometry_versions VALUES (1);
\ir ../../drizzle/0028_data_sources_version_provenance.sql

DO $$
DECLARE
  version_table text;
BEGIN
  IF (SELECT count(*) FROM data_sources) <> 9 THEN
    RAISE EXCEPTION 'Expected nine registry seeds';
  END IF;
  IF EXISTS (SELECT 1 FROM data_sources WHERE NOT is_active OR license IS NOT NULL) THEN
    RAISE EXCEPTION 'Unexpected active/license seed defaults';
  END IF;
  IF EXISTS (SELECT 1 FROM entity_versions WHERE source_id IS NOT NULL OR as_of IS NOT NULL)
    OR EXISTS (SELECT 1 FROM entity_geometry_versions WHERE source_id IS NOT NULL OR as_of IS NOT NULL) THEN
    RAISE EXCEPTION 'Historical provenance must remain unknown';
  END IF;

  FOREACH version_table IN ARRAY ARRAY['entity_versions', 'entity_geometry_versions'] LOOP
    EXECUTE format('INSERT INTO %I (id, source_id, as_of) VALUES (2, ''eia-860m'', ''2026-07-01T00:00:00Z'')', version_table);
    EXECUTE format('INSERT INTO %I (id, source_id, as_of) VALUES (3, ''community'', NULL)', version_table);
    BEGIN
      EXECUTE format('INSERT INTO %I (id, source_id) VALUES (4, ''unregistered'')', version_table);
      RAISE EXCEPTION 'Unregistered source accepted in %', version_table;
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END LOOP;

  BEGIN
    DELETE FROM data_sources WHERE id = 'eia-860m';
    RAISE EXCEPTION 'Referenced source deletion accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE data_sources SET cadence = 'nonsense' WHERE id = 'manual';
    RAISE EXCEPTION 'Invalid cadence accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE data_sources SET authority_tier = 'nonsense' WHERE id = 'manual';
    RAISE EXCEPTION 'Invalid authority accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE data_sources SET is_active = false WHERE id = 'eia-860m';
END $$;
ROLLBACK;
