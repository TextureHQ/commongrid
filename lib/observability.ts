/**
 * Error reporting helpers.
 *
 * CommonGrid reports server-side failures to Sentry. Before this module
 * existed, every failure path in the codebase was a bare `console.error`,
 * which meant production bugs were only visible inside the hosting provider's
 * log-retention window and never surfaced as an alertable issue.
 *
 * These helpers are intentionally thin so that any route, cron job, or library
 * function can report a failure in one line while still attaching enough
 * context to be actionable.
 */

import * as Sentry from "@sentry/nextjs";

export interface ReportContext {
  /** Short, stable name for where the failure happened, e.g. "cron.keep-alive". */
  scope: string;
  /** Additional key/value context. Values must not contain secrets or PII. */
  extra?: Record<string, unknown>;
  /** Severity. Defaults to "error". */
  level?: "fatal" | "error" | "warning" | "info";
}

/**
 * Report an error to Sentry and to the console.
 *
 * Always logs locally, so behaviour is unchanged when no DSN is configured
 * (local development, forks, self-hosted deployments without Sentry).
 */
export function reportError(err: unknown, context: ReportContext): void {
  const { scope, extra, level = "error" } = context;

  console.error(`[${scope}]`, err);

  Sentry.withScope((sentryScope) => {
    sentryScope.setLevel(level);
    sentryScope.setTag("scope", scope);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        sentryScope.setExtra(key, value);
      }
    }
    if (err instanceof Error) {
      Sentry.captureException(err);
    } else {
      Sentry.captureException(new Error(`${scope}: ${String(err)}`));
    }
  });
}

/**
 * Report a non-exception condition worth knowing about (a failed invariant, a
 * degraded dependency, a stale data source).
 */
export function reportMessage(message: string, context: ReportContext): void {
  const { scope, extra, level = "warning" } = context;

  console.warn(`[${scope}] ${message}`);

  Sentry.withScope((sentryScope) => {
    sentryScope.setLevel(level);
    sentryScope.setTag("scope", scope);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        sentryScope.setExtra(key, value);
      }
    }
    Sentry.captureMessage(message);
  });
}

/**
 * Flush buffered events before a serverless function is frozen.
 *
 * Serverless runtimes can suspend the process immediately after the response is
 * returned, discarding in-flight Sentry requests. Scheduled jobs in particular
 * must flush explicitly, since nothing else keeps the instance warm.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Never let telemetry delivery failures affect the caller.
  }
}

// ---------------------------------------------------------------------------
// Scheduled job monitoring
// ---------------------------------------------------------------------------

export interface CronMonitorOptions {
  /** Stable slug identifying the job in Sentry, e.g. "cron-keep-alive". */
  slug: string;
  /** Crontab expression describing when the job is expected to run. */
  schedule: string;
  /** Minutes the job may be late before it is considered missed. Default 30. */
  checkinMarginMinutes?: number;
  /** Minutes the job may run before it is considered stuck. Default 30. */
  maxRuntimeMinutes?: number;
}

/**
 * Run a scheduled job wrapped in a Sentry cron monitor.
 *
 * A plain error report only fires when a job *runs and fails*. It cannot tell
 * you that a job stopped running at all — which is the more dangerous failure
 * for a data registry, because stale data looks exactly like fresh data. A cron
 * monitor alerts on missed and stuck check-ins as well.
 *
 * The monitor config is upserted on each run, so the schedule lives in code
 * rather than being hand-configured in the Sentry UI.
 */
export async function withCronMonitor<T>(options: CronMonitorOptions, job: () => Promise<T>): Promise<T> {
  const { slug, schedule, checkinMarginMinutes = 30, maxRuntimeMinutes = 30 } = options;

  return Sentry.withMonitor(slug, job, {
    schedule: { type: "crontab", value: schedule },
    checkinMargin: checkinMarginMinutes,
    maxRuntime: maxRuntimeMinutes,
    timezone: "Etc/UTC",
  });
}
