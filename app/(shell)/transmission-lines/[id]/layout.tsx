import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchTransmissionLineForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const line = await fetchTransmissionLineForMetadata(id);

  if (!line) {
    return buildMetadata({ title: PAGE_TITLES.transmissionLineDetail });
  }

  const route = line.sub1 && line.sub2 ? ` ${line.sub1} → ${line.sub2}.` : "";
  const voltageClass = line.voltageClass ? ` ${line.voltageClass} voltage class.` : "";
  const length = line.lengthMiles > 0 ? ` ${line.lengthMiles.toFixed(1)} miles.` : "";

  return buildMetadata({
    title: `Line ${line.id}`,
    section: PAGE_TITLES.transmissionLines,
    description: `Transmission line ${line.id} on CommonGrid — owned by ${line.owner}, connecting substations and carrying bulk electricity.${route}${voltageClass}${length}`,
  });
}

export default function TransmissionLineDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
