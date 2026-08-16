import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add a Pricing Node",
  section: PAGE_TITLES.pricingNodes,
});

export default function NewPricingNodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
