import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.moderationQueue });

export default function ModerationContributionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
