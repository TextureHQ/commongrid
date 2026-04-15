import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

/**
 * Database client for API routes (serverless).
 * Uses Neon's HTTP driver for stateless connections.
 *
 * Returns null if DATABASE_URL is not configured.
 */
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const sql = neon(url);
  return drizzle(sql);
}

export const db = createClient();

/**
 * Get the database client, throwing if not configured.
 * Use in API routes that require database access.
 */
export function getDb() {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in environment variables."
    );
  }
  return db;
}
