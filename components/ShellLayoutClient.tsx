"use client";

import { Suspense, type ReactNode } from "react";
import { type NavigationItem, TopBar } from "@/components/TopBar";

interface ShellLayoutClientProps {
  children: ReactNode;
  navigation: NavigationItem[];
}

export function ShellLayoutClient({ children, navigation }: ShellLayoutClientProps) {
  return (
    <div className="flex flex-col h-dvh">
      <Suspense fallback={<div className="h-16 border-b border-border-default bg-background-surface/95" />}>
        <TopBar navigation={navigation} />
      </Suspense>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
