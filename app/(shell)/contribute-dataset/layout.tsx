import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: PAGE_TITLES.contributeDataset,
  description:
    "Suggest a dataset for CommonGrid. The registry is community-maintained and open to new datasets that make the U.S. energy graph more complete.",
});

export default function ContributeDatasetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
