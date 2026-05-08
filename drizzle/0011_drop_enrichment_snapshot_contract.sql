-- Drop obsolete utility-enrichment snapshot contract.
--
-- The public API should be the source of truth for utility facts. Consumers
-- should call the REST endpoints directly with caching instead of mirroring
-- CommonGrid data through a database view. This migration removes the
-- short-lived enrichment snapshot objects while keeping the commongrid schema
-- and internal_api_consumer role for generic server-to-server contract objects
-- such as utility-name resolution and lifecycle signals.

BEGIN;

REVOKE ALL ON commongrid.v_crm_org_enrichment FROM internal_api_consumer;
REVOKE ALL ON commongrid.enrichment_schema FROM internal_api_consumer;

DROP VIEW IF EXISTS commongrid.v_crm_org_enrichment;
DROP VIEW IF EXISTS commongrid.v_utility_enrichment;
DROP VIEW IF EXISTS commongrid.v_utilities_enriched;
DROP TABLE IF EXISTS commongrid.enrichment_schema;

COMMIT;
