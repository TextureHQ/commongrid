/**
 * Changelog — recent changes across every entity type.
 *
 * Rendered on the server. The feed used to be fetched in the browser, which
 * meant painting the static fallback first and replacing it with the real feed
 * a moment later — a visible flash of ten placeholder entries before the one
 * real change appeared.
 */

import { fetchChangelogFeed } from "@/lib/data/changelog-feed";
import type { Changelog } from "@/types/changelog";
import { ChangelogView } from "./ChangelogView";

export const dynamic = "force-dynamic";

// Rendered per request, never at build time.
//
// Prerendering this page meant querying the database during `next build`. On
// Vercel that hung: both builds of this branch sat at 46 minutes and were killed
// by the 45-minute limit, while every other branch built in four. A caught
// exception cannot save you from a call that simply never returns, so the fix is
// not to make the build talk to the database at all.
//
// Server rendering is what removes the flash; prerendering was only an
// optimisation on top, and not one worth a build that can hang.

export default async function ChangelogPage() {
  const feed = await fetchChangelogFeed({ limit: 200 });

  // The view splits by kind only to compute its two counters; the feed itself
  // arrives already sorted.
  const changelog: Changelog = {
    updatedAt: new Date().toISOString(),
    recentlyUpdated: feed.entries.filter((e) => e.kind !== "added"),
    newlyAdded: feed.entries.filter((e) => e.kind === "added"),
  };

  return <ChangelogView changelog={changelog} />;
}
