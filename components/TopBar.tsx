"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useColorMode } from "@texturehq/edges";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useGlobalSearch } from "@/components/GlobalSearch";
import { UserMenu } from "@/components/UserMenu";

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
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" style={{ width: 16, height: 16 }}>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const SearchIcon = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

const MoonIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

const SunIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
  </svg>
);

const MenuIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12h18M3 6h18M3 18h18" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export function TopBar({ navigation }: TopBarProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isDarkTheme, toggleTheme } = useColorMode();
  const { isSignedIn, isLoaded } = useAuth();
  const { open: openSearch } = useGlobalSearch();

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

  const showAuth = mounted && isLoaded;

  return (
    <header className="cg-nav">
      <div className="cg-nav-inner">
        {/* Logo */}
        <Link href="/" className="cg-brand-lockup" aria-label="CommonGrid home">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="4" cy="4" r="1.8" fill="currentColor" />
            <circle cx="12" cy="4" r="1.8" fill="currentColor" />
            <circle cx="20" cy="4" r="1.8" fill="currentColor" />
            <circle cx="28" cy="4" r="1.8" fill="currentColor" />
            <circle cx="4" cy="12" r="1.8" fill="currentColor" />
            <circle cx="4" cy="20" r="1.8" fill="currentColor" />
            <circle cx="28" cy="12" r="1.8" fill="currentColor" />
            <circle cx="28" cy="20" r="1.8" fill="currentColor" />
            <circle cx="4" cy="28" r="1.8" fill="currentColor" />
            <circle cx="12" cy="28" r="1.8" fill="currentColor" />
            <circle cx="20" cy="28" r="1.8" fill="currentColor" />
            <circle cx="28" cy="28" r="1.8" fill="currentColor" />
            <rect x="11" y="11" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
          <span>CommonGrid</span>
        </Link>

        {/* Nav links */}
        <nav className="cg-nav-links">
          {navigation.map((item) =>
            item.external ? (
              <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            ) : (
              <Link key={item.id} href={item.href} className={isActive(item) ? "active" : undefined}>
                {item.label}
              </Link>
            )
          )}
        </nav>

        {/* Right side */}
        <div className="cg-nav-right">
          {/* Search */}
          <button type="button" className="cg-nav-search" onClick={openSearch} aria-label="Search">
            <SearchIcon />
            <span>Search</span>
            <span className="cg-nav-kbd">&thinsp;&#8984;K</span>
          </button>

          {/* GitHub */}
          <a
            href="https://github.com/TextureHQ/commongrid"
            target="_blank"
            rel="noopener noreferrer"
            className="cg-icon-btn"
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>

          {/* Dark mode */}
          {mounted && (
            <button type="button" className="cg-icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode">
              {isDarkTheme ? <SunIcon /> : <MoonIcon />}
            </button>
          )}

          {/* Auth */}
          {showAuth && !isSignedIn && (
            <SignInButton mode="modal">
              <button type="button" className="cg-nav-signin">
                Sign In
              </button>
            </SignInButton>
          )}
          {showAuth && isSignedIn && <UserMenu />}
        </div>

        {/* Mobile right */}
        <div className="cg-nav-mobile-right">
          {showAuth && !isSignedIn && (
            <SignInButton mode="modal">
              <button type="button" className="cg-nav-signin">
                Sign In
              </button>
            </SignInButton>
          )}
          {showAuth && isSignedIn && <UserMenu />}
          {mounted && (
            <button type="button" className="cg-icon-btn" onClick={toggleTheme} aria-label="Toggle color mode">
              {isDarkTheme ? <SunIcon /> : <MoonIcon />}
            </button>
          )}
          <button
            type="button"
            className="cg-icon-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="cg-nav-mobile-menu">
          {navigation.map((item) =>
            item.external ? (
              <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            ) : (
              <Link key={item.id} href={item.href} className={isActive(item) ? "active" : undefined}>
                {item.label}
              </Link>
            )
          )}
          <a href="https://github.com/TextureHQ/commongrid" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
      )}
    </header>
  );
}
