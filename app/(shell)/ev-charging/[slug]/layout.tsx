import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchEvStationForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const station = await fetchEvStationForMetadata(slug);

  if (!station) {
    return buildMetadata({ title: PAGE_TITLES.evStationDetail });
  }

  const location = [station.city, station.state].filter(Boolean).join(", ");
  const network = station.evNetwork ? ` Operated on the ${station.evNetwork} network.` : "";

  return buildMetadata({
    title: station.stationName,
    section: PAGE_TITLES.evCharging,
    description: `${station.stationName}${location ? ` in ${location}` : ""} — EV charging station on CommonGrid: connector types, port counts, access, and pricing. Source: DOE AFDC.${network}`,
  });
}

export default function EvStationDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
