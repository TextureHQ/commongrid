import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.gridOperators });

export default function GridOperatorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
