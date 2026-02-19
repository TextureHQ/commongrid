import type { ReactNode } from "react";
import { ShellLayoutClient } from "@/components/ShellLayoutClient";

export default function ShellLayout({ children }: { children: ReactNode }) {
  const navigation = [
    { id: "explore", label: "Explore", href: "/" },
    { id: "utilities", label: "Utilities", href: "/utilities" },
    {
      id: "grid-operators",
      label: "Grid Operators",
      href: "/grid-operators",
      activePatterns: ["/balancing-authorities/", "/isos/", "/rtos/"],
    },
    { id: "about", label: "About", href: "/about" },
  ];

  return <ShellLayoutClient navigation={navigation}>{children}</ShellLayoutClient>;
}
