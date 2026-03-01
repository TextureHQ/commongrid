import type { ReactNode } from "react";
import { ShellLayoutClient } from "@/components/ShellLayoutClient";

export default function ShellLayout({ children }: { children: ReactNode }) {
  const navigation = [
    { id: "explore", label: "Explore", href: "/explore" },
    { id: "api", label: "API", href: "https://docs.opengrid.dev", external: true },
    { id: "changelog", label: "Changelog", href: "/changelog" },
    { id: "about", label: "About", href: "/about" },
  ];

  return <ShellLayoutClient navigation={navigation}>{children}</ShellLayoutClient>;
}
