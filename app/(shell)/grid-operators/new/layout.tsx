import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add a Grid Operator",
  section: PAGE_TITLES.gridOperators,
});

export default function NewGridOperatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
