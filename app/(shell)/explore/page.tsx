"use client";

import { ExplorerShell } from "@/components/explorer/ExplorerShell";

export default function ExplorePage() {
  // `?view=`/`?tab=` (layer) and `?mode=` (map|table) are parsed from the URL
  // inside ExplorerProvider, which owns the explore route stack. Passing them
  // down as props would create a second source of truth that drifts.
  const mapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorerShell mapboxAccessToken={mapboxAccessToken} />;
}
