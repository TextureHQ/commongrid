"use client";

import { Button, Icon, useColorMode } from "@texturehq/edges";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
  activePatterns?: string[];
};

interface TopBarProps {
  navigation: NavigationItem[];
}

const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="h-[18px] w-[18px]">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

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
    <header className="sticky top-0 z-30 bg-[var(--color-background-subtle)] border-b border-border-default">
      <div className="flex items-center h-14 px-5">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" className="h-6 w-6 text-text-heading">
              <circle cx="10" cy="10" r="3.5"/><circle cx="25" cy="10" r="3.5"/><circle cx="40" cy="10" r="3.5"/><circle cx="55" cy="10" r="3.5"/><circle cx="70" cy="10" r="3.5"/><circle cx="85" cy="10" r="3.5"/>
              <circle cx="10" cy="90" r="3.5"/><circle cx="25" cy="90" r="3.5"/><circle cx="40" cy="90" r="3.5"/><circle cx="55" cy="90" r="3.5"/><circle cx="70" cy="90" r="3.5"/><circle cx="85" cy="90" r="3.5"/>
              <circle cx="10" cy="26" r="3.5"/><circle cx="10" cy="42" r="3.5"/><circle cx="10" cy="58" r="3.5"/><circle cx="10" cy="74" r="3.5"/>
              <circle cx="85" cy="26" r="3.5"/><circle cx="85" cy="42" r="3.5"/><circle cx="85" cy="58" r="3.5"/><circle cx="85" cy="74" r="3.5"/>
              <rect x="28" y="28" width="8" height="44" rx="2"/><rect x="28" y="64" width="30" height="8" rx="2"/><rect x="58" y="28" width="8" height="44" rx="2"/><rect x="44" y="28" width="22" height="8" rx="2"/>
            </svg>
            <span className="text-[15px] font-semibold text-text-heading tracking-tight">
              OpenGrid
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-0.5">
            {navigation.map((item) =>
              item.external ? (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-md text-sm transition-colors text-text-muted hover:text-text-body"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive(item)
                      ? "text-text-body font-medium"
                      : "text-text-muted hover:text-text-body"
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>

        {/* Right: icons */}
        <div className="ml-auto hidden sm:flex items-center gap-1">
          <Button
            variant="icon"
            href="https://github.com/TextureHQ/opengrid"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
          >
            <GitHubIcon />
          </Button>

          {mounted && (
            <Button
              variant="icon"
              onClick={toggleTheme}
              aria-label="Toggle color mode"
            >
              <Icon name={isDarkTheme ? "Sun" : "Moon"} size={18} />
            </Button>
          )}
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="ml-auto flex items-center gap-1 sm:hidden">
          {mounted && (
            <Button
              variant="icon"
              onClick={toggleTheme}
              aria-label="Toggle color mode"
            >
              <Icon name={isDarkTheme ? "Sun" : "Moon"} size={18} />
            </Button>
          )}
          <Button
            variant="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <Icon name={mobileMenuOpen ? "X" : "List"} size={20} />
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-border-default px-4 py-2">
          {navigation.map((item) =>
            item.external ? (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded-md text-sm transition-colors text-text-muted hover:text-text-body"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive(item) ? "text-text-body font-medium" : "text-text-muted hover:text-text-body"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
          <Button
            variant="icon"
            href="https://github.com/TextureHQ/opengrid"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 w-full justify-start text-sm"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </Button>
        </nav>
      )}
    </header>
  );
}
