import { IsoDetailClient } from "./_iso-detail-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function IsoDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <IsoDetailClient slug={slug} mapboxAccessToken={mapboxAccessToken} />;
}
