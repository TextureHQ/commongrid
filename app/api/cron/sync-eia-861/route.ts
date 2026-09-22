/**
 * Cron endpoint: EIA-861 annual Demand Response sync.
 *
 * EIA-861 "final" is published annually, but revisions trickle in through the
 * year, so this cron re-checks monthly (15th, 03:00 UTC) — the underlying
 * script is checksum-gated and idempotent, so a re-check with no upstream change
 * is a cheap no-op that writes zero versions.
 *
 * ⚠️ DATA REALITY: this sync asserts utility-level aggregate DR metrics onto
 * EXISTING utilities only; it never fabricates program entities.
 *
 * Schedule: monthly, 15th at 03:00 UTC ("0 3 15 * *")
 * Auth: Internal only (verified by CRON_SECRET Bearer token)
 * Success: 200 with stats. Failure: 503 with error message.
 */

import { spawn } from "node:child_process";
import { flushTelemetry, reportError, withCronMonitor } from "@/lib/observability";

interface SyncResult {
  status: "ok" | "error" | "skipped";
  timestamp: string;
  output?: string;
  error?: string;
}

// Vercel Pro plan caps serverless function maxDuration at 800s. Parsing a single
// annual workbook + one applySync pass is well under this.
export const maxDuration = 800;

const SCHEDULE = "0 3 15 * *";

export async function GET(request: Request): Promise<Response> {
  return withCronMonitor(
    { slug: "cron-sync-eia-861", schedule: SCHEDULE, checkinMarginMinutes: 60, maxRuntimeMinutes: 20 },
    () => runSyncEia861(request)
  );
}

async function runSyncEia861(request: Request): Promise<Response> {
  const timestamp = new Date().toISOString();
  const result: SyncResult = { status: "ok", timestamp };

  console.log(`[${timestamp}] EIA-861 sync cron triggered`);

  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !authHeader?.startsWith(`Bearer ${cronSecret}`)) {
      console.warn(`[${timestamp}] Unauthorized cron attempt`);
      return Response.json({ status: "error", error: "Unauthorized" }, { status: 401 });
    }

    result.output = await runSyncScript();

    console.log(`[${timestamp}] EIA-861 sync completed successfully`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.status = "error";
    result.error = message;
    reportError(err, { scope: "cron.sync-eia-861", extra: { phase: "run-sync", timestamp } });
    await flushTelemetry();
    return Response.json(result, { status: 503 });
  }
}

/**
 * Spawn the tsx sync script and capture output. Timeout leaves a buffer under
 * the function ceiling so we can respond with a proper error instead of a hard
 * kill.
 */
function runSyncScript(): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const maxTime = 780 * 1000; // 13 min

    const proc = spawn("npx", ["tsx", "scripts/sync-eia-861.ts"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: maxTime,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeoutHandle = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Sync script timeout after ${maxTime / 1000}s`));
    }, maxTime);

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      const elapsed = Date.now() - startTime;
      if (code === 0) {
        resolve(`Sync completed in ${elapsed}ms.\nStdout:\n${stdout}`);
      } else {
        reject(new Error(`Sync script exited with code ${code} after ${elapsed}ms.\nStderr:\n${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Failed to spawn sync script: ${err.message}`));
    });
  });
}
