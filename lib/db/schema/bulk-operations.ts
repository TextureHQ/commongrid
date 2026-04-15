import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Bulk Operations (Idempotency Tracking)
 *
 * Tracks bulk upsert operations by idempotency key to prevent duplicate
 * writes when sync scripts are retried. If a sync crashes after 50%
 * completion and restarts, the completed operation is detected and the
 * cached result is returned.
 */
export const bulkOperations = pgTable(
  "bulk_operations",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: jsonb("result"),
  },
  (table) => [
    index("idx_bulk_ops_created").on(table.createdAt),
  ]
);

export type BulkOperationSelect = typeof bulkOperations.$inferSelect;
export type BulkOperationInsert = typeof bulkOperations.$inferInsert;
