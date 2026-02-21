import { RTODetailClient } from "./_rto-detail-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function RtoDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <RTODetailClient slug={slug} mapboxAccessToken={mapboxAccessToken} />;
}
