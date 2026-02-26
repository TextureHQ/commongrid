import type { ReactNode } from "react";
import { ShellLayoutClient } from "@/components/ShellLayoutClient";

export default function ShellLayout({ children }: { children: ReactNode }) {
  const navigation = [
    { id: "explore", label: "Explore", href: "/explore" },
    { id: "pricing-nodes", label: "Pricing Nodes", href: "/pricing-nodes" },
    { id: "api", label: "API", href: "https://docs.opengrid.dev", external: true },
    { id: "about", label: "About", href: "/about" },
  ];

  return <ShellLayoutClient navigation={navigation}>{children}</ShellLayoutClient>;
}
