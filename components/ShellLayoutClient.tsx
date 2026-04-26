"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { GlobalSearchModal, GlobalSearchProvider, useGlobalSearch } from "@/components/GlobalSearch";
import { type NavigationItem, TopBar } from "@/components/TopBar";
import { useCurrentUser } from "@/hooks/useCurrentUser";

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
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user, isLoading: isUserLoading } = useCurrentUser();

  // Navigation is "settled" once we know the final link set:
  // - Auth not loaded yet → not settled
  // - Not signed in → settled (no moderation link possible)
  // - Signed in but user profile still loading → not settled
  // - Signed in and user loaded → settled
  const isNavSettled = isAuthLoaded && (!isSignedIn || !isUserLoading);

  // Add Moderation nav item if user is admin or moderator
  const enhancedNavigation = useMemo(() => {
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return navigation;
    }

    // Check if moderation item already exists
    const hasMod = navigation.some((item) => item.id === "moderation");
    if (hasMod) {
      return navigation;
    }

    // Insert moderation item after contributions
    const contribIndex = navigation.findIndex((item) => item.id === "contributions");
    if (contribIndex === -1) {
      return [...navigation, { id: "moderation", label: "Moderation", href: "/mod" }];
    }

    return [
      ...navigation.slice(0, contribIndex + 1),
      { id: "moderation", label: "Moderation", href: "/mod" },
      ...navigation.slice(contribIndex + 1),
    ];
  }, [user, navigation]);

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
      <TopBar navigation={enhancedNavigation} navigationReady={isNavSettled} />
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
