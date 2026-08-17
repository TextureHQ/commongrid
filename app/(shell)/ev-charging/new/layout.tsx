import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add an EV Charging Station",
  section: PAGE_TITLES.evCharging,
});

export default function NewEvStationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
