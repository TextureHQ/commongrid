import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Add a Program",
  section: PAGE_TITLES.programs,
});

export default function NewProgramLayout({ children }: { children: React.ReactNode }) {
  return children;
}
