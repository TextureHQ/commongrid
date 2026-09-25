"use client";

import posthog from "posthog-js";
import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";
import { useEffect, useState } from "react";
import { AnalyticsTracking } from "@/components/AnalyticsTracking";
import { sanitizePostHogEvent } from "@/lib/analytics";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
let initialized = false;

/** Initialize before identity/conversions, but never block the app on the SDK. */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!apiKey);

  useEffect(() => {
    if (apiKey && !initialized) {
      try {
        posthog.init(apiKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
          before_send: sanitizePostHogEvent,
        });
        initialized = true;
      } catch {
        // Analytics failure must never prevent rendering the application.
      } finally {
        setReady(true);
      }
    } else {
      setReady(true);
    }
  }, []);

  const content = (
    <>
      {ready && <AnalyticsTracking />}
      {children}
    </>
  );
  if (!apiKey) return content;
  return <PostHogReactProvider client={posthog}>{content}</PostHogReactProvider>;
}
