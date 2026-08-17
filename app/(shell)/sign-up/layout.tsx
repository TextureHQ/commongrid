import type { Metadata } from "next";
import { buildMetadata, PAGE_TITLES } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({ title: PAGE_TITLES.signUp });

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
