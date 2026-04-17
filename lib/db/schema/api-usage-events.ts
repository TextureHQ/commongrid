import { bigserial, boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { apiKeys } from "./api-keys";

/**
 * API Usage Events — Request Logging
 *
 * Records every API request for usage analytics and rate limit audits.
 * Uses BIGSERIAL (not UUID) for smaller row size (8 bytes vs 16) and
 * efficient cursor-based pagination. IP addresses are NOT stored for privacy.
 *
 * Retention: keep all data initially. When table exceeds 1M rows, implement
 * the api_usage_daily (§3.18) aggregation table and drop raw events older
 * than 90 days.
 */
export const apiUsageEvents = pgTable(
  "api_usage_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** FK to api_keys; ON DELETE SET NULL — events preserved when key is deleted */
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),

    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    responseTimeMs: integer("response_time_ms").notNull(),

    isAuthenticated: boolean("is_authenticated").notNull().default(false),
    /** 'anonymous' | 'registered' | 'bulk' */
    tier: text("tier").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_usage_api_key").on(table.apiKeyId, table.createdAt),
    index("idx_usage_endpoint").on(table.endpoint, table.createdAt),
    index("idx_usage_created").on(table.createdAt),
    index("idx_usage_status").on(table.statusCode, table.createdAt),
    // Partial index — defined in migration DDL:
    // CREATE INDEX idx_usage_authed ON api_usage_events(api_key_id, created_at DESC)
    //   WHERE is_authenticated = true;
  ]
);

export type ApiUsageEventSelect = typeof apiUsageEvents.$inferSelect;
export type ApiUsageEventInsert = typeof apiUsageEvents.$inferInsert;
