import { GoogleAnalytics as NextGoogleAnalytics } from "@next/third-parties/google";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Site-wide Google Analytics 4 tag.
 *
 * The measurement id is intentionally public (it ships in the client bundle by
 * design) and uses the NEXT_PUBLIC_ prefix like the other browser-safe keys in
 * this app (PostHog, Sentry DSN, Clerk publishable key). Rendering nothing when
 * the id is unset keeps local development and forked deployments free of GA
 * traffic without any extra configuration.
 */
export function GoogleAnalytics() {
  if (!measurementId) return null;

  return <NextGoogleAnalytics gaId={measurementId} />;
}
