import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: "Privacy Notice" });

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
