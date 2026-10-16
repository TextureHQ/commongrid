import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: "Terms of Use" });

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
