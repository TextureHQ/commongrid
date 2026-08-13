"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * `app/global-error.tsx` only catches failures in the root layout. Without this
 * file, an error thrown while rendering any page or nested layout is handled by
 * Next.js's built-in fallback and never reaches Sentry — which is a large blind
 * spot, since page-level render errors are the most common client failure.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-prose text-sm text-neutral-500">
        We hit an unexpected error rendering this page. The problem has been reported.
      </p>
      {error.digest ? <p className="font-mono text-xs text-neutral-400">Reference: {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Try again
      </button>
    </div>
  );
}
