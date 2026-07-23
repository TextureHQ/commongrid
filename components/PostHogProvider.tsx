"use client";

import { useUser } from "@clerk/nextjs";
import { PostHogProvider as PostHogReactProvider, usePostHog } from "posthog-js/react";
import { useEffect } from "react";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

function PostHogUserIdentification() {
  const { isLoaded, user } = useUser();
  const posthog = usePostHog();

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      // Avoid attributing a future visitor on this browser to the prior account.
      posthog.reset();
      return;
    }

    posthog.identify(user.id, {
      $email: user.primaryEmailAddress?.emailAddress,
      $name: user.fullName ?? user.username ?? undefined,
    });
  }, [isLoaded, posthog, user, user?.fullName, user?.id, user?.primaryEmailAddress?.emailAddress, user?.username]);

  return null;
}

/**
 * Site-wide product analytics and feature-flag context.
 *
 * The browser project key is intentionally public. Rendering children without a
 * configured key keeps local and forked deployments fully functional.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!apiKey) return <>{children}</>;

  return (
    <PostHogReactProvider
      apiKey={apiKey}
      options={{
        api_host: apiHost,
        autocapture: true,
        capture_pageview: "history_change",
        capture_pageleave: true,
        person_profiles: "identified_only",
      }}
    >
      <PostHogUserIdentification />
      {children}
    </PostHogReactProvider>
  );
}
