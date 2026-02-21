import { UtilityDetailClient } from "./_utility-detail-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function UtilityDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <UtilityDetailClient slug={slug} mapboxAccessToken={mapboxAccessToken} />;
}
