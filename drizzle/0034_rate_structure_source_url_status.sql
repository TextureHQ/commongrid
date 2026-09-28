-- CG-310 fast-follow: track sourceUrl health so dead tariff PDFs can be hidden.
-- Existing records remain null until the weekly URDB sync re-ingests them.
ALTER TABLE "rate_structures" ADD COLUMN IF NOT EXISTS "source_url_status" text;
ALTER TABLE "rate_structures" ADD COLUMN IF NOT EXISTS "source_url_checked_at" timestamp with time zone;
