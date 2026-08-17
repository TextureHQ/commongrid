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

// The feed changes when a contribution is approved, so it must not be baked in
// at build time. Revalidating on an interval keeps the page prerendered — and
// therefore instant and indexable — while staying close to current.
export const revalidate = 60;

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
