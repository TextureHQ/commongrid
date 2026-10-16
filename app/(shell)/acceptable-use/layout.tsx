import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: "Acceptable Use Policy" });

export default function AcceptableUseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
