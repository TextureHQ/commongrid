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
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

interface SyncResult {
  status: "ok" | "error" | "skipped";
  timestamp: string;
  output?: string;
  error?: string;
  statsJson?: Record<string, unknown>;
  statsGeojson?: Record<string, unknown>;
}

// Vercel Pro plan caps serverless function maxDuration at 800s.
// For longer syncs (full US sweep can exceed this), trigger the script via a
// separate long-running job (e.g., GitHub Actions) and have this endpoint
// return after a partial slice.
export const maxDuration = 800; // 13m20s — Vercel Pro ceiling

export async function GET(request: Request): Promise<Response> {
  const timestamp = new Date().toISOString();
  const result: SyncResult = { status: "ok", timestamp };

  console.log(`[${timestamp}] Substations sync cron triggered`);

  try {
    // Basic auth check: require CRON_SECRET header
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !authHeader || !authHeader.startsWith(`Bearer ${cronSecret}`)) {
      console.warn(`[${timestamp}] Unauthorized cron attempt`);
      return Response.json({ status: "error", error: "Unauthorized" }, { status: 401 });
    }

    // Run the sync script via tsx
    const syncOutput = await runSyncScript();
    result.output = syncOutput;

    // Load the resulting stats (if available)
    const dataDir = path.join(process.cwd(), "data");
    const statsJsonPath = path.join(dataDir, "substations.json");
    const statsGeojsonPath = path.join(dataDir, "substations.geojson");

    if (existsSync(statsJsonPath)) {
      try {
        const jsonData = JSON.parse(readFileSync(statsJsonPath, "utf-8"));
        result.statsJson = {
          count: Array.isArray(jsonData) ? jsonData.length : Object.keys(jsonData).length,
          lastUpdated: timestamp,
        };
      } catch (err) {
        console.error(`[${timestamp}] Failed to parse substations.json:`, err);
      }
    }

    if (existsSync(statsGeojsonPath)) {
      try {
        const geojsonData = JSON.parse(readFileSync(statsGeojsonPath, "utf-8"));
        result.statsGeojson = {
          features: geojsonData.features?.length || 0,
          lastUpdated: timestamp,
        };
      } catch (err) {
        console.error(`[${timestamp}] Failed to parse substations.geojson:`, err);
      }
    }

    console.log(`[${timestamp}] Substations sync completed successfully`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.status = "error";
    result.error = message;
    console.error(`[${timestamp}] Substations sync failed:`, message);
    return Response.json(result, { status: 503 });
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
