-- Performance index for the /api/v1/rates list endpoint.
-- Backs the keyset ORDER BY (name, id) used for SQL-side cursor pagination.
CREATE INDEX IF NOT EXISTS "idx_rate_structures_name_id" ON "rate_structures" ("name", "id");
