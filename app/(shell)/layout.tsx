import type { ReactNode } from "react";
import { ShellLayoutClient } from "@/components/ShellLayoutClient";

export default function ShellLayout({ children }: { children: ReactNode }) {
  const navigation = [
    { id: "home", label: "Home", href: "/" },
    { id: "explore", label: "Explore", href: "/explore" },
    { id: "about", label: "About", href: "/about" },
  ];

  return <ShellLayoutClient navigation={navigation}>{children}</ShellLayoutClient>;
}
