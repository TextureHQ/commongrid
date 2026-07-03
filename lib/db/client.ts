import { neon } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { drizzle as nodeDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let _db: ReturnType<typeof neonDrizzle> | ReturnType<typeof nodeDrizzle> | null = null;

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("::1");
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (isLocalUrl(url)) {
    const pool = new Pool({ connectionString: url });
    _db = nodeDrizzle({ client: pool });
  } else {
    const sql = neon(url);
    _db = neonDrizzle(sql);
  }

  return _db;
}

export const db = createClient();

export function getDb() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured. Set it in environment variables.");
  }
  return db;
}
