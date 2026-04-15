import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

/**
 * Pooled database client for long-running scripts (sync, seed).
 * Uses WebSocket connections with connection pooling.
 *
 * Returns null if DATABASE_URL is not configured.
 */
function createPooledClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const pool = new Pool({ connectionString: url, max: 10 });
  return drizzle(pool);
}

export const pooledDb = createPooledClient();

/**
 * Get the pooled database client, throwing if not configured.
 */
export function getPooledDb() {
  if (!pooledDb) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in environment variables."
    );
  }
  return pooledDb;
}
