interface DbStatus {
  status: "ok" | "error" | "unconfigured";
  latencyMs?: number;
  error?: string;
}

interface SyncStatus {
  lastSyncAt: string | null;
  stale: boolean;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  database?: DbStatus;
  lastSync?: SyncStatus;
  version: string | undefined;
}

async function checkDatabase(): Promise<DbStatus> {
  if (!process.env.DATABASE_URL) {
    return { status: "unconfigured" };
  }

  const start = Date.now();

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkLastSync(): Promise<SyncStatus> {
  // Placeholder: read last sync timestamp from env or metadata
  // In the future this could query a sync_metadata table or a KV store
  const lastSyncAt = process.env.LAST_SYNC_AT ?? null;

  if (!lastSyncAt) {
    return { lastSyncAt: null, stale: false };
  }

  const syncDate = new Date(lastSyncAt);
  const staleCutoff = 48 * 60 * 60 * 1000; // 48 hours in ms
  const stale = Date.now() - syncDate.getTime() > staleCutoff;

  return { lastSyncAt, stale };
}

export async function GET() {
  const [db, lastSync] = await Promise.all([checkDatabase(), checkLastSync()]);

  let status: HealthResponse["status"] = "healthy";

  if (db.status === "error") {
    status = "unhealthy";
  } else if (lastSync.stale) {
    status = "degraded";
  }

  const body: HealthResponse = {
    status,
    database: db,
    lastSync,
    version: process.env.VERCEL_GIT_COMMIT_SHA,
  };

  const httpStatus = status === "unhealthy" ? 503 : 200;

  return Response.json(body, { status: httpStatus });
}
