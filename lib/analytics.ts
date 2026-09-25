"use client";

import posthog from "posthog-js";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const posthogEnabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
const seen = new Set<string>();
let gaInitialized = false;

type AnalyticsWindow = Window & { dataLayer?: unknown[] };

/** Queue before the remote script loads; gtag expects Arguments, not plain arrays. */
export function gaCommand(..._args: unknown[]) {
  if (!gaId || typeof window === "undefined") return;
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  // biome-ignore lint/complexity/noArguments: gtag's documented queue format is an Arguments object.
  target.dataLayer.push(arguments);
}

export function initializeGA() {
  if (!gaId || gaInitialized) return;
  gaInitialized = true;
  gaCommand("js", new Date());
  gaCommand("config", gaId, {
    send_page_view: false,
    allow_google_signals: false,
    ...pageProperties(),
    ...campaignProperties(),
  });
}

/** No query strings, fragments, or authentication callback paths in telemetry. */
export function analyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = /^\/(sign-in|sign-up)(\/|$)/.exec(url.pathname);
    return `${url.origin}${path ? `/${path[1]}` : url.pathname}`;
  } catch {
    return "";
  }
}

/** Preserve explicit campaign attribution without forwarding arbitrary URL parameters. */
export function campaignProperties() {
  const params = new URLSearchParams(window.location.search);
  const properties: Record<string, string> = {};
  for (const name of ["source", "medium", "campaign", "term", "content", "id"]) {
    const value = params.get(`utm_${name}`);
    if (value && /^[a-zA-Z0-9_. -]{1,100}$/.test(value)) {
      properties[name === "campaign" ? "campaign_name" : `campaign_${name}`] = value;
    }
  }
  return properties;
}

export function pageProperties() {
  return {
    page_location: analyticsUrl(window.location.href),
    page_referrer: analyticsUrl(document.referrer),
    page_title: "CommonGrid",
  };
}

/** Independent, best-effort destinations: analytics must never break a user action. */
export function captureEvent(name: string, properties: Record<string, string> = {}) {
  if (typeof window === "undefined") return;
  try {
    gaCommand("event", name, { ...pageProperties(), ...properties });
  } catch {
    // Browser extensions and disabled analytics must not affect application behavior.
  }
  try {
    if (posthogEnabled) posthog.capture(name === "page_view" ? "$pageview" : name, properties);
  } catch {
    // Keep the application functional if a vendor fails.
  }
}

/** Resource IDs stay local: they are neither event parameters nor API key material. */
function captureOnce(name: string, id: string) {
  const key = `cg:conversion:${name}:${id}`;
  if (seen.has(key)) return;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    // In-memory deduplication still covers rerenders when storage is blocked.
  }
  seen.add(key);
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Analytics remains best-effort in private/restricted browsers.
  }
  captureEvent(name);
}

type AnalyticsUser = {
  id: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  fullName?: string | null;
  username?: string | null;
};

export function identifyAnalyticsUser(user: AnalyticsUser | null) {
  gaCommand("set", { user_id: user?.id ?? null });
  if (!posthogEnabled) return;
  try {
    // $user_id survives reloads. An anonymous browser has none: do not reset it.
    const previous = posthog.get_property("$user_id");
    if (previous && previous !== user?.id) posthog.reset();
    if (user) {
      posthog.identify(user.id, {
        $email: user.primaryEmailAddress?.emailAddress,
        $name: user.fullName ?? user.username ?? undefined,
      });
    }
  } catch {
    // Identity enrichment must not interfere with authentication.
  }
}

type CompletedSignUp = {
  status: string | null;
  createdUserId: string | null;
  createdSessionId: string | null;
};

/** Clerk's completed signup resource, not a login or a recent-account heuristic. */
export function trackCompletedSignUp(signUp: CompletedSignUp | null | undefined) {
  if (signUp?.status !== "complete" || !signUp.createdUserId || !signUp.createdSessionId) return;
  captureOnce("sign_up", signUp.createdUserId);
}

/** Instrument only confirmed creations, never PATCH/resubmission, clicks, or failures. */
export async function conversionFetch(input: string, init: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const event =
    input === "/api/v1/developer/keys"
      ? "api_key_created"
      : input === "/api/v1/contributions"
        ? "contribution_submitted"
        : null;
  if (event && init.method === "POST" && response.status === 201) {
    try {
      const body: unknown = await response.clone().json();
      if (body && typeof body === "object" && "data" in body) {
        const data = body.data;
        if (data && typeof data === "object" && "id" in data && typeof data.id === "string") {
          captureOnce(event, data.id);
        }
      }
    } catch {
      // Leave the original response readable and preserve the caller's error handling.
    }
  }
  return response;
}

/** Also sanitize SDK-generated defaults on custom events and identify calls. */
export function sanitizePostHogEvent<T extends { properties: Record<string, unknown> }>(event: T | null): T | null {
  if (!event) return null;
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
    if (typeof event.properties[key] === "string") event.properties[key] = analyticsUrl(event.properties[key]);
  }
  delete event.properties.$title;
  // Initial person properties can also contain the original query string.
  for (const key of ["$set", "$set_once"]) {
    const properties = event.properties[key];
    if (properties && typeof properties === "object") {
      sanitizePostHogEvent({ properties: properties as Record<string, unknown> });
    }
  }
  return event;
}
