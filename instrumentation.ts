import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Next.js calls `onRequestError` for every uncaught server-side error,
 * including errors thrown inside nested React Server Components which are
 * otherwise invisible to the SDK.
 *
 * Without this export the build logs:
 *   "[@sentry/nextjs] Could not find `onRequestError` hook in instrumentation
 *    file. This indicates outdated configuration of the Sentry SDK."
 *
 * See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
export const onRequestError = Sentry.captureRequestError;
