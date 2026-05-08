-- Add commongrid schema + internal_api_consumer role for server-to-server
-- integration contracts.
--
-- The commongrid schema is a dedicated namespace for API contract objects
-- (stored procedures, entity-resolution helpers, lifecycle views) that
-- server-to-server consumers can call via the internal_api_consumer role.
-- Consumers of these contracts should NOT have direct SELECT on public.*
-- tables; the schema is the stable, versioned contract surface.
--
-- This migration is pure-additive: creates the schema, the role, and a
-- placeholder login user. No tables, views, or functions are added yet;
-- those land in subsequent migrations as the contract is populated.

BEGIN;

-- Dedicated namespace for server-to-server API contracts.
CREATE SCHEMA IF NOT EXISTS commongrid;
COMMENT ON SCHEMA commongrid IS 'Versioned contract namespace for server-to-server API consumers. Objects here are stable, documented, and safe for external callers to pin.';

-- Role is NOLOGIN; callers connect through the login user below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer') THEN
    CREATE ROLE internal_api_consumer NOLOGIN;
  END IF;
END $$;

COMMENT ON ROLE internal_api_consumer IS 'Scoped read-only role for server-to-server callers of the commongrid.* contract surface. No direct grants on public.*.';

GRANT USAGE ON SCHEMA commongrid TO internal_api_consumer;

-- Login user wrapping the role. Real password is rotated in the Neon
-- console post-deploy and stored in the Fleet Secrets vault; the literal
-- below is a non-viable placeholder so this migration is committable to
-- a public repo without leaking credentials.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'internal_api_consumer_user') THEN
    CREATE USER internal_api_consumer_user WITH PASSWORD 'CHANGE_ME_IN_NEON_CONSOLE';
  END IF;
END $$;

GRANT internal_api_consumer TO internal_api_consumer_user;

COMMIT;
