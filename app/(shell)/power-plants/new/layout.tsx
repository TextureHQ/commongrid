import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add a Power Plant",
  section: PAGE_TITLES.powerPlants,
});

export default function NewPowerPlantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
