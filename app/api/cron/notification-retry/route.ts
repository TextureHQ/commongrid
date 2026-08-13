/**
 * GET /api/cron/notification-retry — Notification Delivery Retry
 *
 * Vercel Cron job (every 30 minutes) that re-triggers Knock workflows for
 * notifications that are still 'pending' after at least 5 minutes and have
 * been attempted fewer than 3 times.
 *
 * Batch size: 100 notifications per run.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { isKnockConfigured } from "@/lib/knock/client";
import {
  triggerChangesRequested,
  triggerContributionApproved,
  triggerContributionReturned,
} from "@/lib/knock/workflows";
import { flushTelemetry, reportError, withCronMonitor } from "@/lib/observability";

const BATCH_SIZE = 100;
const MIN_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

// Keep in sync with the `crons` entry in vercel.json.
const SCHEDULE = "*/30 * * * *";

export async function GET() {
  return withCronMonitor(
    { slug: "cron-notification-retry", schedule: SCHEDULE, checkinMarginMinutes: 15, maxRuntimeMinutes: 10 },
    runNotificationRetry
  );
}

async function runNotificationRetry(): Promise<Response> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] notification-retry cron triggered`);

  if (!isKnockConfigured()) {
    console.log(`[${timestamp}] Skipped: Knock is not configured`);
    return Response.json({ status: "skipped", reason: "Knock not configured", timestamp });
  }

  if (!process.env.DATABASE_URL) {
    console.log(`[${timestamp}] Skipped: No database configured`);
    return Response.json({ status: "skipped", reason: "No database configured", timestamp });
  }

  const db = getDb();
  const cutoff = new Date(Date.now() - MIN_AGE_MS);

  let pending: (typeof notifications.$inferSelect)[];

  try {
    pending = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.emailStatus, "pending"),
          lt(notifications.createdAt, cutoff),
          lt(notifications.deliveryAttempts, MAX_ATTEMPTS)
        )
      )
      .limit(BATCH_SIZE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, { scope: "cron.notification-retry", extra: { phase: "query-pending", timestamp } });
    await flushTelemetry();
    return Response.json({ status: "error", error: message, timestamp }, { status: 500 });
  }

  console.log(`[${timestamp}] Found ${pending.length} notifications to retry`);

  let retried = 0;
  let errors = 0;

  for (const notif of pending) {
    try {
      // Increment delivery_attempts before re-triggering
      await db
        .update(notifications)
        .set({ deliveryAttempts: sql`${notifications.deliveryAttempts} + 1` })
        .where(eq(notifications.id, notif.id));

      // Re-trigger the Knock workflow based on notification type
      const d = (notif.data as Record<string, unknown>) ?? {};
      let workflowRunId: string | null = null;

      switch (notif.type) {
        case "contribution_approved":
          workflowRunId = await triggerContributionApproved(notif.userId, {
            contributionId: (d.contribution_id as string) ?? notif.refId,
            entityType: (d.entity_type as string) ?? "",
            entitySlug: (d.entity_slug as string) ?? "",
            entityUrl: (d.entity_url as string) ?? "",
            contributionUrl: notif.url ?? `/contributions/${notif.refId}`,
            moderatorComment: (d.moderator_comment as string) ?? null,
            changeSummary: notif.body ?? null,
          });
          break;
        case "contribution_returned":
          workflowRunId = await triggerContributionReturned(notif.userId, {
            contributionId: (d.contribution_id as string) ?? notif.refId,
            entityType: (d.entity_type as string) ?? "",
            entitySlug: (d.entity_slug as string) ?? "",
            entityUrl: (d.entity_url as string) ?? "",
            contributionUrl: notif.url ?? `/contributions/${notif.refId}`,
            moderatorComment: (d.moderator_comment as string) ?? null,
            changeSummary: notif.body ?? null,
          });
          break;
        case "changes_requested":
          workflowRunId = await triggerChangesRequested(notif.userId, {
            contributionId: (d.contribution_id as string) ?? notif.refId,
            entityType: (d.entity_type as string) ?? "",
            entitySlug: (d.entity_slug as string) ?? "",
            entityUrl: (d.entity_url as string) ?? "",
            contributionUrl: notif.url ?? `/contributions/${notif.refId}`,
            moderatorComment: (d.moderator_comment as string) ?? null,
            changeSummary: notif.body ?? null,
          });
          break;
        default:
          // No Knock workflow for this notification type
          break;
      }

      // Store the workflow_run_id if we got one
      if (workflowRunId) {
        await db.update(notifications).set({ knockWorkflowRunId: workflowRunId }).where(eq(notifications.id, notif.id));
      }

      retried++;
    } catch (err) {
      errors++;
      reportError(err, {
        scope: "cron.notification-retry",
        extra: { phase: "retry-notification", notificationId: notif.id, notificationType: notif.type, timestamp },
      });
    }
  }

  console.log(`[${timestamp}] notification-retry complete: retried=${retried}, errors=${errors}`);

  await flushTelemetry();

  return Response.json({
    status: "ok",
    retried,
    errors,
    total: pending.length,
    timestamp,
  });
}
