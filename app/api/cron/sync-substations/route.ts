/**
 * Cron endpoint: Weekly substations sync.
 *
 * Triggers the substations data sync (OSM + EIA hybrid).
 * Wired to Vercel's cron scheduler or equivalent.
 *
 * Schedule: Weekly (e.g., every Monday 00:00 UTC)
 * Timeout: 30 minutes (enough for full US sweep)
 * Auth: Internal only (verified by CRON_SECRET env var)
 *
 * Success: Returns 200 with stats. Failure: 503 with error message.
 */

import { spawn } from "node:child_process";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { flushTelemetry, reportError, withCronMonitor } from "@/lib/observability";

interface SyncResult {
  status: "ok" | "error" | "skipped";
  timestamp: string;
  output?: string;
  error?: string;
  stats?: {
    count: number;
    lastUpdated: string;
  };
}

// Vercel Pro plan caps serverless function maxDuration at 800s.
// For longer syncs (full US sweep can exceed this), trigger the script via a
// separate long-running job (e.g., GitHub Actions) and have this endpoint
// return after a partial slice.
export const maxDuration = 800; // 13m20s — Vercel Pro ceiling

// Weekly substations sync. Not currently in vercel.json `crons` (it is
// triggered manually / by an external scheduler), so the monitor schedule
// documents the intended cadence: Mondays at 00:00 UTC.
const SCHEDULE = "0 0 * * 1";

export async function GET(request: Request): Promise<Response> {
  return withCronMonitor(
    { slug: "cron-sync-substations", schedule: SCHEDULE, checkinMarginMinutes: 60, maxRuntimeMinutes: 20 },
    () => runSyncSubstations(request)
  );
}

async function runSyncSubstations(request: Request): Promise<Response> {
  const timestamp = new Date().toISOString();
  const result: SyncResult = { status: "ok", timestamp };

  console.log(`[${timestamp}] Substations sync cron triggered`);

  try {
    // Basic auth check: require CRON_SECRET header
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !authHeader?.startsWith(`Bearer ${cronSecret}`)) {
      console.warn(`[${timestamp}] Unauthorized cron attempt`);
      return Response.json({ status: "error", error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }

    // Run the sync script via tsx
    const syncOutput = await runSyncScript();
    result.output = syncOutput;

    // Load the resulting stats from the DB (the committed JSON artifacts were
    // removed in CG-327).
    const dbStats = await loadDbStats();
    result.stats = {
      count: dbStats.count,
      lastUpdated: timestamp,
    };

    console.log(`[${timestamp}] Substations sync completed successfully`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.status = "error";
    result.error = message;
    reportError(err, { scope: "cron.sync-substations", extra: { phase: "run-sync", timestamp } });
    await flushTelemetry();
    return Response.json(result, { status: 503 });
  }
}

async function loadDbStats(): Promise<{ count: number }> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  try {
    const result = await db.execute(sql`SELECT COUNT(*) AS count FROM substations WHERE deleted_at IS NULL`);
    return { count: Number(result.rows[0].count) };
  } finally {
    await pool.end();
  }
}

/**
 * Spawn the tsx sync script and capture output.
 * Timeout after 28 minutes to leave buffer for response.
 */
function runSyncScript(): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    // Leave a small buffer under the 800s function ceiling so we can still
    // respond with a proper error on timeout instead of being hard-killed.
    const maxTime = 780 * 1000; // 13 min

    const proc = spawn("npx", ["tsx", "scripts/sync-substations.ts"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: maxTime,
      env: {
        ...process.env,
        // Required: the sync now writes directly to Postgres and no longer
        // produces committed JSON artifacts (CG-327).
        DATABASE_URL: process.env.DATABASE_URL ?? "",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const elapsed = Date.now() - startTime;
      if (code === 0) {
        resolve(`Sync completed in ${elapsed}ms.\nStdout:\n${stdout}`);
      } else {
        reject(new Error(`Sync script exited with code ${code} after ${elapsed}ms.\nStderr:\n${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn sync script: ${err.message}`));
    });

    // Guard against script hanging
    const timeoutHandle = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Sync script timeout after ${maxTime / 1000}s`));
    }, maxTime);

    proc.on("close", () => {
      clearTimeout(timeoutHandle);
    });
  });
}
