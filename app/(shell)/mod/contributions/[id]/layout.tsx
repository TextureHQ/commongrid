import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  // Contribution ids are opaque, so a short prefix keeps the tab title
  // scannable while still distinguishing between open review tabs.
  const shortId = id.length > 8 ? `${id.slice(0, 8)}…` : id;

  return buildMetadata({
    title: `Reviewing ${shortId}`,
    section: PAGE_TITLES.moderation,
  });
}

export default function ModerationContributionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
