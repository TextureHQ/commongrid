"use client";

import { Icon, useColorMode } from "@texturehq/edges";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  activePatterns?: string[];
};

interface TopBarProps {
  navigation: NavigationItem[];
}

export function TopBar({ navigation }: TopBarProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isDarkTheme, toggleTheme } = useColorMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isActive = (item: NavigationItem) => {
    if (pathname === item.href) return true;
    if (item.href !== "/" && pathname.startsWith(`${item.href}/`)) return true;
    return item.activePatterns?.some((p) => pathname.startsWith(p)) ?? false;
  };

  return (
    <header className="sticky top-0 z-30 bg-background-surface/95 backdrop-blur-sm border-b border-border-default">
      <div className="flex items-center justify-between h-16 px-5">
        <Link href="/" className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" className="h-7 w-7 text-text-heading">
            <circle cx="10" cy="10" r="3.5"/><circle cx="25" cy="10" r="3.5"/><circle cx="40" cy="10" r="3.5"/><circle cx="55" cy="10" r="3.5"/><circle cx="70" cy="10" r="3.5"/><circle cx="85" cy="10" r="3.5"/>
            <circle cx="10" cy="90" r="3.5"/><circle cx="25" cy="90" r="3.5"/><circle cx="40" cy="90" r="3.5"/><circle cx="55" cy="90" r="3.5"/><circle cx="70" cy="90" r="3.5"/><circle cx="85" cy="90" r="3.5"/>
            <circle cx="10" cy="26" r="3.5"/><circle cx="10" cy="42" r="3.5"/><circle cx="10" cy="58" r="3.5"/><circle cx="10" cy="74" r="3.5"/>
            <circle cx="85" cy="26" r="3.5"/><circle cx="85" cy="42" r="3.5"/><circle cx="85" cy="58" r="3.5"/><circle cx="85" cy="74" r="3.5"/>
            <rect x="28" y="28" width="8" height="44" rx="2"/><rect x="28" y="64" width="30" height="8" rx="2"/><rect x="58" y="28" width="8" height="44" rx="2"/><rect x="44" y="28" width="22" height="8" rx="2"/>
          </svg>
          <span className="text-lg font-semibold text-text-heading tracking-tight">
            CommonGrid
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`px-3.5 py-2 rounded-md text-[15px] transition-colors ${
                isActive(item) ? "text-brand-primary font-semibold" : "text-text-muted hover:text-text-body"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {mounted && (
            <button
              type="button"
              onClick={toggleTheme}
              className="ml-2 p-1.5 rounded-md text-text-muted hover:text-text-body transition-colors"
              aria-label="Toggle color mode"
            >
              <Icon name={isDarkTheme ? "Sun" : "Moon"} size={18} />
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:hidden">
          {mounted && (
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-text-muted hover:text-text-body transition-colors"
              aria-label="Toggle color mode"
            >
              <Icon name={isDarkTheme ? "Sun" : "Moon"} size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-body transition-colors"
            aria-label="Toggle menu"
          >
            <Icon name={mobileMenuOpen ? "X" : "List"} size={20} />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-border-default px-4 py-2">
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                isActive(item) ? "text-brand-primary font-semibold" : "text-text-muted hover:text-text-body"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
