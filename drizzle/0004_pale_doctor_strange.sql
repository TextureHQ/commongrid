ALTER TABLE "utilities" ADD COLUMN "domains" text[];--> statement-breakpoint
-- GIN index for array containment queries (e.g., WHERE domains @> ARRAY['example.com'])
CREATE INDEX "idx_utilities_domains" ON "utilities" USING GIN("domains");
