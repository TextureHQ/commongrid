"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { type NavigationItem, TopBar } from "@/components/TopBar";
import { GlobalSearchModal, GlobalSearchProvider, useGlobalSearch } from "@/components/GlobalSearch";

interface ShellLayoutClientProps {
  children: ReactNode;
  navigation: NavigationItem[];
}

/**
 * Inner wrapper that wires up the ⌘K / Ctrl+K keyboard shortcut.
 * Must be inside GlobalSearchProvider to access the context.
 */
function ShellInner({ children, navigation }: ShellLayoutClientProps) {
  const { open } = useGlobalSearch();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="flex flex-col h-dvh">
      <TopBar navigation={navigation} />
      <main className="flex-1 min-h-0">{children}</main>
      <GlobalSearchModal />
    </div>
  );
}

export function ShellLayoutClient({ children, navigation }: ShellLayoutClientProps) {
  return (
    <GlobalSearchProvider>
      <ShellInner navigation={navigation}>{children}</ShellInner>
    </GlobalSearchProvider>
  );
}
