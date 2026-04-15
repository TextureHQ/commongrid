import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * API Keys
 *
 * Scoped API keys with hash storage for authenticated access to the
 * CommonGrid write API and platform integration endpoints.
 *
 * Keys are UUIDv4 tokens prefixed with `cg_` (e.g., cg_a1b2c3d4-e5f6-...).
 * The plaintext is shown once at creation and never stored — only the
 * SHA-256 hash is persisted.
 *
 * Scope format: resource:action (e.g., 'utilities:read', 'utilities:write',
 * 'admin:api-keys', '*:read', '*:*').
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(), // SHA-256 hash of the API key
    keyPrefix: text("key_prefix").notNull(), // first 8 chars for identification
    scopes: text("scopes").array().notNull().default(["utilities:read"]),
    rotationGroup: text("rotation_group"), // for zero-downtime key rotation
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_api_keys_hash").on(table.keyHash),
    index("idx_api_keys_active").on(table.isActive),
    index("idx_api_keys_rotation").on(table.rotationGroup),
  ]
);

export type ApiKeySelect = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;
