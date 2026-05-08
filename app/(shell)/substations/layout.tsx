import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "US Electric Substations | CommonGrid",
  description: "Browse and explore US electric substations from EIA and OpenStreetMap data",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function SubstationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
