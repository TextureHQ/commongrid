/**
 * Sentry browser SDK initialization.
 *
 * This file replaces the deprecated `sentry.client.config.ts`. Next.js loads
 * `instrumentation-client.ts` automatically for the browser runtime, and it is
 * the only form that works under Turbopack.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

import * as Sentry from "@sentry/nextjs";
import { currentClientIsBot } from "@/lib/bot-detection";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Parse errors raised inside Clerk's CDN bundle are not actionable on our side
 * (we neither ship nor version that code) and effectively always come from a
 * non-browser client. We drop *only* that narrow combination rather than
 * denying every event whose stack touches Clerk, so real Clerk integration
 * failures still reach us.
 */
const CLERK_CDN = /clerk\.[a-z0-9.-]+\/npm\/@clerk\//i;

function isThirdPartyParseError(event: Sentry.ErrorEvent): boolean {
  const values = event.exception?.values;
  if (!values?.length) return false;

  return values.some((value) => {
    if (value.type !== "SyntaxError") return false;
    const frames = value.stacktrace?.frames;
    if (!frames?.length) return false;
    return frames.some((frame) => typeof frame.filename === "string" && CLERK_CDN.test(frame.filename));
  });
}

Sentry.init({
  dsn,

  // Report from every deployment that has a DSN configured (production and
  // Vercel preview builds), not just `NODE_ENV=production`. Preview builds
  // also run with NODE_ENV=production, so the old check silently no-op'd
  // whenever the DSN was absent anyway.
  enabled: Boolean(dsn),

  // Distinguish production from preview/branch deploys in the Sentry UI.
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

  // Tie events to the deployed commit so stack traces can be symbolicated.
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Capture 100% of errors.
  sampleRate: 1.0,

  // Performance monitoring — sample 20% of transactions.
  tracesSampleRate: 0.2,

  // Replay configuration for debugging production issues.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration(), Sentry.browserTracingIntegration()],

  // Keep this list narrow. Anything added here is invisible forever — prefer
  // fixing the underlying error, or filtering server-side in Sentry's own
  // inbound filters where the drop is at least visible in the stats page.
  ignoreErrors: [
    // Benign layout-thrash warning surfaced as an error by some browsers.
    "ResizeObserver loop",
    // Transient network failure fetching a lazily-loaded bundle.
    /Loading chunk \d+ failed/,
  ],

  beforeSend(event) {
    if (currentClientIsBot()) return null;
    if (isThirdPartyParseError(event)) return null;
    return event;
  },
});

/**
 * Required for client-side navigation instrumentation in the App Router.
 * Without this export the SDK cannot trace route transitions.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
