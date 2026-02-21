import { ExplorePageClient } from "./_explore-client";

export default function ExplorePage() {
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorePageClient mapboxAccessToken={mapboxAccessToken} />;
}
