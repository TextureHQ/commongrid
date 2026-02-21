import { ExplorerShell } from "@/components/explorer/ExplorerShell";

export default function ExplorePage() {
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorerShell mapboxAccessToken={mapboxAccessToken} />;
}
