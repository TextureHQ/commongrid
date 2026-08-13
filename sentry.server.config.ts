import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

Sentry.init({
  dsn,

  // Report from every deployment that has a DSN configured (production and
  // Vercel preview builds). Preview builds also run with NODE_ENV=production,
  // so gating on NODE_ENV added nothing beyond hiding misconfiguration.
  enabled: Boolean(dsn),

  // Distinguish production from preview/branch deploys in the Sentry UI.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",

  // Tie events to the deployed commit so stack traces can be symbolicated.
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Capture 100% of errors.
  sampleRate: 1.0,

  // Performance monitoring — sample 20% of transactions.
  tracesSampleRate: 0.2,
});
