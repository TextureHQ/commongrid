import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchPricingNodeForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const node = await fetchPricingNodeForMetadata(slug);

  if (!node) {
    return buildMetadata({ title: PAGE_TITLES.pricingNodeDetail });
  }

  const title = node.iso ? `${node.name} (${node.iso})` : node.name;
  const where = node.state ? ` Located in ${node.state}.` : "";

  return buildMetadata({
    title,
    section: PAGE_TITLES.pricingNodes,
    description: `${node.name} — ${node.iso ?? "ISO"} pricing node on CommonGrid: node type, voltage, and linked generation.${where}`,
  });
}

export default function PricingNodeDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
