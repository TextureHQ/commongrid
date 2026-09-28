"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { captureEvent, identifyAnalyticsUser, initializeGA, trackCompletedSignUp } from "@/lib/analytics";

/** Shared by Clerk's hosted-in-app page and modal flows, including OAuth callbacks. */
export function AnalyticsTracking() {
  const clerk = useClerk();
  const { isLoaded, user } = useUser();
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    initializeGA();
  }, []);

  useEffect(() => {
    if (isLoaded) identifyAnalyticsUser(user ?? null);
  }, [isLoaded, user]);

  useEffect(() => {
    if (!clerk.loaded) return;
    // Completion can precede activation. Retain it until the corresponding session
    // is active, rather than treating an old signup resource as a returning login.
    let pending: typeof clerk.client.signUp | undefined = clerk.client?.signUp;
    return clerk.addListener(({ client, session, user: activeUser }) => {
      if (client?.signUp?.status === "complete") pending = client.signUp;
      if (
        pending?.status === "complete" &&
        pending.createdSessionId === session?.id &&
        pending.createdUserId === activeUser?.id
      ) {
        identifyAnalyticsUser(activeUser ?? null);
        trackCompletedSignUp(pending);
        pending = undefined;
      }
    });
  }, [clerk, clerk.loaded]);

  useEffect(() => {
    if (!pathname || previousPath.current === pathname) return;
    previousPath.current = pathname;
    captureEvent("page_view");
  }, [pathname]);

  return null;
}
