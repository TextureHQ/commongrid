"use client";

/**
 * NotificationBell — Knock in-app feed bell for the top navigation.
 *
 * Renders a bell icon with an unread badge and a slide-over popover feed,
 * scoped to the currently signed-in user. Works identically for moderators and
 * contributors — the feed is always the logged-in user's own feed.
 *
 * Auth: Knock runs in enhanced-security mode, so we fetch a server-signed user
 * token from POST /api/v1/notifications/token (signed with KNOCK_SIGNING_KEY,
 * which never leaves the server). Until the token resolves — or when the env is
 * not configured — the bell renders nothing so there is no broken/error state.
 *
 * Click-through: each notification carries an `action_url` (set in the Knock
 * workflow in-app step). We intercept clicks and route via Next's client router,
 * converting absolute CommonGrid URLs to relative paths so navigation stays
 * client-side and deep-links straight to the Contribution / feedback.
 */

import type { FeedItem } from "@knocklabs/client";
import { KnockFeedProvider, KnockProvider, NotificationFeedPopover, NotificationIconButton } from "@knocklabs/react";
import { useColorMode } from "@texturehq/edges";
import "@knocklabs/react/dist/index.css";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const FEED_CHANNEL_ID = process.env.NEXT_PUBLIC_KNOCK_FEED_CHANNEL_ID;
const PUBLIC_API_KEY = process.env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY;

interface TokenResponse {
  configured: boolean;
  userId?: string;
  userToken?: string;
}

const tokenFetcher = async (url: string): Promise<TokenResponse> => {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Knock token: ${res.status}`);
  }
  const json = await res.json();
  return json.data as TokenResponse;
};

/**
 * Inner bell — only mounted once we have a user + token + configured env.
 * Kept separate so all Knock hooks run under valid providers.
 */
function BellInner({ userId, userToken }: { userId: string; userToken: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { isDarkTheme } = useColorMode();

  // Route in-app notification clicks through Next's client router, turning
  // absolute CommonGrid links into relative paths for client-side navigation.
  // The in-app step's action_url is delivered as a content block named
  // "action_url" (see @knocklabs/react NotificationCell); fall back to
  // item.data.action_url for forward-compat.
  const handleItemClick = useCallback(
    (item: FeedItem) => {
      setIsVisible(false);
      const block = item.blocks?.find((b) => b.name === "action_url");
      const rendered = block && "rendered" in block ? (block as { rendered?: string }).rendered : undefined;
      const actionUrl = rendered ?? (item.data?.action_url as string | undefined) ?? undefined;
      if (!actionUrl) return;
      try {
        const parsed = new URL(actionUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          router.push(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        } else {
          window.open(actionUrl, "_blank", "noopener,noreferrer");
        }
      } catch {
        // Relative path fallback
        router.push(actionUrl);
      }
    },
    [router]
  );

  return (
    <KnockProvider apiKey={PUBLIC_API_KEY} user={{ id: userId }} userToken={userToken}>
      <KnockFeedProvider feedId={FEED_CHANNEL_ID as string} colorMode={isDarkTheme ? "dark" : "light"}>
        <NotificationIconButton ref={buttonRef} onClick={() => setIsVisible((v) => !v)} />
        <NotificationFeedPopover
          buttonRef={buttonRef}
          isVisible={isVisible}
          onClose={() => setIsVisible(false)}
          onNotificationClick={handleItemClick}
        />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

export function NotificationBell() {
  const { user } = useCurrentUser();

  // Only fetch a token once we have a signed-in user and the public env is set.
  const canInit = Boolean(user?.id && FEED_CHANNEL_ID && PUBLIC_API_KEY);
  const { data } = useSWR<TokenResponse>(canInit ? "/api/v1/notifications/token" : null, tokenFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Refresh the signed token before the 1h server TTL expires.
    refreshInterval: 45 * 60 * 1000,
  });

  const ready = useMemo(() => Boolean(data?.configured && data.userId && data.userToken), [data]);

  if (!ready || !data?.userId || !data.userToken) return null;

  return <BellInner userId={data.userId} userToken={data.userToken} />;
}
