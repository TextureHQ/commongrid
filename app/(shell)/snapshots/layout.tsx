import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.snapshots });

export default function SnapshotsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
