import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add a Transmission Line",
  section: PAGE_TITLES.transmissionLines,
});

export default function NewTransmissionLineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
