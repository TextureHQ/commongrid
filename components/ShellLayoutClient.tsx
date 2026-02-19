"use client";

import type { ReactNode } from "react";
import { type NavigationItem, TopBar } from "@/components/TopBar";

interface ShellLayoutClientProps {
  children: ReactNode;
  navigation: NavigationItem[];
}

export function ShellLayoutClient({ children, navigation }: ShellLayoutClientProps) {
  return (
    <div className="flex flex-col h-dvh">
      <TopBar navigation={navigation} />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
