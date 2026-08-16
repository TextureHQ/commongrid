import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";
import { fetchBalancingAuthorityForMetadata } from "@/lib/server/metadata-fetch";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ba = await fetchBalancingAuthorityForMetadata(slug);

  if (!ba) {
    return buildMetadata({ title: PAGE_TITLES.balancingAuthorityDetail });
  }

  const title = ba.shortName && ba.shortName !== ba.name ? `${ba.name} (${ba.shortName})` : ba.name;
  const footprint = ba.states.length > 0 ? ` Footprint: ${ba.states.join(", ")}.` : "";

  return buildMetadata({
    title,
    section: PAGE_TITLES.balancingAuthorities,
    description: `${ba.name} balancing authority on CommonGrid — real-time supply and demand balancing footprint, member utilities, and EIA identifiers.${footprint}`,
  });
}

export default function BalancingAuthorityDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
