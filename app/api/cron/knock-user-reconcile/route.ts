/**
 * GET /api/cron/knock-user-reconcile — Daily Knock user reconciliation
 *
 * Vercel Cron job (daily at 09:00 UTC) that diffs Postgres users against
 * Knock and re-identifies any user missing from Knock or whose role, email,
 * or display name has drifted.
 */

import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getKnockClient, isKnockConfigured } from "@/lib/knock/client";
import { identifyKnockUser } from "@/lib/knock/sync";
import { flushTelemetry, reportError, withCronMonitor } from "@/lib/observability";

// Keep in sync with the `crons` entry in vercel.json.
const SCHEDULE = "0 9 * * *";

interface KnockUserEntry {
  id: string;
  email?: string | null;
  name?: string | null;
  custom?: {
    role?: string;
  };
}

function userDrifted(dbUser: typeof users.$inferSelect, knockUser: KnockUserEntry | undefined): boolean {
  if (!knockUser) return true;

  const knockRole = knockUser.custom?.role;
  if (knockRole !== dbUser.role) return true;

  const knockEmail = knockUser.email?.toLowerCase() ?? null;
  const dbEmail = dbUser.email?.toLowerCase() ?? null;
  if (knockEmail !== dbEmail) return true;

  const knockName = knockUser.name ?? null;
  const dbName = dbUser.displayName ?? null;
  if (knockName !== dbName) return true;

  return false;
}

export async function GET() {
  return withCronMonitor(
    { slug: "cron-knock-user-reconcile", schedule: SCHEDULE, checkinMarginMinutes: 15, maxRuntimeMinutes: 15 },
    runReconcile
  );
}

async function runReconcile(): Promise<Response> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] knock-user-reconcile cron triggered`);

  if (!isKnockConfigured()) {
    console.log(`[${timestamp}] Skipped: Knock is not configured`);
    return Response.json({ status: "skipped", reason: "Knock not configured", timestamp });
  }

  if (!process.env.DATABASE_URL) {
    console.log(`[${timestamp}] Skipped: No database configured`);
    return Response.json({ status: "skipped", reason: "No database configured", timestamp });
  }

  const db = getDb();

  let dbUsers: (typeof users.$inferSelect)[];
  try {
    dbUsers = await db.select().from(users).orderBy(asc(users.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, { scope: "cron.knock-user-reconcile", extra: { phase: "query-users", timestamp } });
    await flushTelemetry();
    return Response.json({ status: "error", error: message, timestamp }, { status: 500 });
  }

  let knockUserById: Map<string, KnockUserEntry>;
  try {
    const knock = getKnockClient();
    knockUserById = new Map<string, KnockUserEntry>();
    for await (const knockUser of knock.users.list()) {
      knockUserById.set(knockUser.id, knockUser as unknown as KnockUserEntry);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, { scope: "cron.knock-user-reconcile", extra: { phase: "list-knock-users", timestamp } });
    await flushTelemetry();
    return Response.json({ status: "error", error: message, timestamp }, { status: 500 });
  }

  let reconciled = 0;
  let skipped = 0;
  let inSync = 0;

  for (const dbUser of dbUsers) {
    if (!dbUser.email?.trim()) {
      skipped++;
      continue;
    }

    const knockUser = knockUserById.get(dbUser.id);
    if (!userDrifted(dbUser, knockUser)) {
      inSync++;
      continue;
    }

    try {
      await identifyKnockUser(dbUser);
      reconciled++;
    } catch (err) {
      reportError(err, {
        scope: "cron.knock-user-reconcile",
        extra: { phase: "identify-user", userId: dbUser.id, timestamp },
      });
    }
  }

  console.log(
    `[${timestamp}] knock-user-reconcile complete: reconciled=${reconciled}, skipped=${skipped}, inSync=${inSync}, total=${dbUsers.length}`
  );

  await flushTelemetry();

  return Response.json({
    status: "ok",
    reconciled,
    skipped,
    inSync,
    total: dbUsers.length,
    timestamp,
  });
}
