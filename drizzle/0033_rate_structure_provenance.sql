-- CG-307: extend the shipped catalog; do not create a parallel tariff table.
-- Existing records remain null until the normal scheduled sync observes them.
ALTER TABLE "rate_structures" ADD COLUMN "raw_record" jsonb;
ALTER TABLE "rate_structures" ADD COLUMN "upstream_record_url" text;
ALTER TABLE "rate_structures" ADD COLUMN "attribution" jsonb;
