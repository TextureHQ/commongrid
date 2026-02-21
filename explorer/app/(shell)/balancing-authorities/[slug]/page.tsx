import { BADetailClient } from "./_ba-detail-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BADetailPage({ params }: PageProps) {
  const { slug } = await params;
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <BADetailClient slug={slug} mapboxAccessToken={mapboxAccessToken} />;
}
