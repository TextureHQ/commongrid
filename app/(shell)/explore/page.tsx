import type { Metadata } from "next";
import { ExplorerShell } from "@/components/explorer/ExplorerShell";

export const metadata: Metadata = {
  title: "Explore",
  description: "Interactive map and data explorer for US energy infrastructure — utilities, power plants, transmission lines, EV charging stations, and pricing nodes.",
};

export default function ExplorePage() {
  const mapboxAccessToken =
    process.env.MAPBOX_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return <ExplorerShell mapboxAccessToken={mapboxAccessToken} />;
}
