import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchSubstationForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const substation = await fetchSubstationForMetadata(slug);

  if (!substation) {
    return buildMetadata({ title: PAGE_TITLES.substationDetail });
  }

  const voltage = substation.maxVoltageKv ? ` ${substation.maxVoltageKv} kV max voltage.` : "";
  const owner = substation.ownerName ? ` Operated by ${substation.ownerName}.` : "";
  const location = substation.state ? ` Located in ${substation.state}.` : "";

  return buildMetadata({
    title: substation.name,
    section: PAGE_TITLES.substations,
    description: `${substation.name} — electric substation on CommonGrid: voltage, ownership, location, and connected transmission lines.${voltage}${owner}${location}`,
  });
}

export default function SubstationDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
