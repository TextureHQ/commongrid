import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as nodeDrizzle } from "drizzle-orm/node-postgres";
import { Pool as NodePool } from "pg";
import { isLocalUrl } from "./client";

/**
 * Pooled database client — use this anywhere a real transaction is required.
 *
 * Unlike `lib/db/client.ts`, which speaks Neon's stateless HTTP protocol for
 * remote databases (one request per query, so BEGIN/COMMIT has no session to
 * live in), this driver holds a session and therefore supports transactions,
 * ROLLBACK and `SELECT ... FOR UPDATE`.
 *
 * Used by long-running scripts (sync, seed) and by contribution write paths,
 * where the entity write and its `entity_versions` row must land together — a
 * partial apply leaves an unversioned change that history can never account for.
 *
 * Swaps drivers on the same rule as `client.ts`: node-postgres for a local
 * database, Neon's WebSocket pool for a Neon URL. Neon's driver cannot talk to
 * a plain local Postgres, so without this every contribution write would fail
 * against the local dev database.
 *
 * Prefer `getDb()` for reads: HTTP has lower per-query overhead and needs no
 * connection from the pool.
 *
 * Returns null if DATABASE_URL is not configured.
 */
function createPooledClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (isLocalUrl(url)) {
    return nodeDrizzle({ client: new NodePool({ connectionString: url }) });
  }

  return neonDrizzle(new NeonPool({ connectionString: url, max: 10 }));
}

export const pooledDb = createPooledClient();

/**
 * Get the pooled database client, throwing if not configured.
 */
export function getPooledDb() {
  if (!pooledDb) {
    throw new Error("DATABASE_URL is not configured. Set it in environment variables.");
  }
  return pooledDb;
}
