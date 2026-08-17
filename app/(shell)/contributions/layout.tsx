import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.contributions });

export default function ContributionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
