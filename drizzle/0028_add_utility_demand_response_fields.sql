-- CG-289: add utility-level EIA-861 Demand Response fields.
--
-- EIA-861 "Demand Response" is utility-level AGGREGATE statistics, not a named
-- program catalog. Its grain is (utility_id_eia, state, customer_class,
-- balancing_authority_code, report_year). The sync aggregates customer classes
-- (Residential/Commercial/Industrial/Transport) to a per-utility total and
-- asserts those totals — plus a "has demand response" existence signal — onto
-- the matching utilities row. It writes only these columns and never fabricates
-- program entities.
--
-- All columns are nullable/additive so the migration is backward-compatible and
-- lands safely while the previous deployment is still serving (per AGENTS.md).
-- Owned exclusively by sync:eia-861 via lib/sync/eia-861-dr.ts OWNED_FIELDS.

ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "has_demand_response" boolean;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_customers_enrolled" integer;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_potential_peak_savings_mw" double precision;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_actual_peak_savings_mw" double precision;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_energy_savings_mwh" double precision;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_program_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "utilities" ADD COLUMN IF NOT EXISTS "dr_report_year" integer;
