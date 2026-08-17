import type { Metadata, Viewport } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: PAGE_TITLES.substations,
  description: "Browse and explore US electric substations from EIA and OpenStreetMap data",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function SubstationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
