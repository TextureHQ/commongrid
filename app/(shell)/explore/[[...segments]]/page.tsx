"use client";

import { ExplorerShell } from "@/components/explorer/ExplorerShell";

// Optional catch-all so every path-based explore route resolves to the same
// client surface (CG-252):
//   /explore
//   /explore/utilities
//   /explore/utilities/:utilitySlug
//   /explore/utilities/:utilitySlug/programs/:programSlug
//   /explore/programs
//   /explore/programs/:programSlug
//
// The navigation stack is derived from `usePathname()` inside ExplorerProvider,
// which owns the explore route stack. Query params (`?mode=table`, `?q=`,
// list filters) carry view options only — never navigation state. Passing the
// path segments down as props would create a second source of truth that
// drifts from the live pathname, so we intentionally do not.
export default function ExplorePage() {
  const mapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorerShell mapboxAccessToken={mapboxAccessToken} />;
}
