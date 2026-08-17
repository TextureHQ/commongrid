import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchPowerPlantForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const plant = await fetchPowerPlantForMetadata(slug);

  if (!plant) {
    return buildMetadata({ title: PAGE_TITLES.powerPlantDetail });
  }

  const location = plant.state ? ` Located in ${plant.state}.` : "";
  const fuel = plant.primaryFuel ? ` Primary fuel: ${plant.primaryFuel}.` : "";
  const capacity = plant.totalCapacityMw ? ` ${plant.totalCapacityMw.toFixed(1)} MW nameplate capacity.` : "";

  return buildMetadata({
    title: plant.name,
    section: PAGE_TITLES.powerPlants,
    description: `${plant.name} — power plant on CommonGrid: capacity, fuel type, ownership, generators, and location.${capacity}${fuel}${location}`,
  });
}

export default function PowerPlantDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
