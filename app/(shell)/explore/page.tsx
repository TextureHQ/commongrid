"use client";

import { ExplorerShell } from "@/components/explorer/ExplorerShell";
import type { EntityTab, ExploreViewMode } from "@/components/explorer/ExplorerContext";
import { useSearchParams } from "next/navigation";

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") || undefined) as EntityTab | undefined;
  const mode = (searchParams.get("mode") || undefined) as ExploreViewMode | undefined;

  const mapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorerShell mapboxAccessToken={mapboxAccessToken} view={view} mode={mode} />;
}
