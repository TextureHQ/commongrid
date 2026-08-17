import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.moderation });

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
