import type { Metadata } from "next";
import { PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = { title: PAGE_TITLES.explore };

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
