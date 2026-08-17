import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUtilityBySlug } from "@/lib/data";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const utility = await getUtilityBySlug(slug);

  if (!utility) {
    notFound();
  }

  return buildMetadata({
    title: utility.name,
    section: PAGE_TITLES.gridOperators,
    description: `Details for ${utility.name}, a grid operator in the CommonGrid database.`, // Example description
  });
}

export default function GridOperatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
