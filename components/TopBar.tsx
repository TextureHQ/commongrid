"use client";

import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useColorMode } from "@texturehq/edges";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** When false, nav links are hidden to prevent flash while user role resolves */
  navigationReady?: boolean;
}

const GitHubIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" style={{ width: 16, height: 16 }}>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const SearchIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
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

export function TopBar({ navigation, navigationReady = true }: TopBarProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isDarkTheme, toggleTheme } = useColorMode();
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
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

  return (
    <>
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

          {/* Nav links — invisible until navigation is settled to prevent flash */}
          <nav className="cg-nav-links" style={navigationReady ? undefined : { visibility: "hidden" }}>
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

            {/* Auth — hidden until Clerk resolves to prevent flash */}
            {!isAuthLoaded ? (
              <div style={{ width: 32, height: 32 }} />
            ) : isSignedIn ? (
              <UserMenu />
            ) : (
              <SignInButton mode="modal">
                <button type="button" className="cg-nav-signin">
                  Sign In
                </button>
              </SignInButton>
            )}
          </div>

          {/* Mobile right — search icon + auth + hamburger.
             Search is a top-level affordance (one tap to a full-screen
             search sheet). Theme toggle and other settings live in the
             drawer footer to keep this row compact. The search icon is
             rendered at 20px to visually balance the 20px hamburger
             beside it (the inline 14px desktop icon is too small to
             read on a 60px-tall mobile nav). */}
          <div className="cg-nav-mobile-right">
            <button
              type="button"
              className="cg-icon-btn cg-nav-mobile-search"
              onClick={openSearch}
              aria-label="Search the registry"
            >
              <SearchIcon size={20} />
            </button>
            {isAuthLoaded && isSignedIn && <UserMenu />}
            <button
              type="button"
              className="cg-icon-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* Mobile slide-over menu */}
      </header>
      {/* Portal to body so scrim covers full viewport, not just the sticky header */}
      {mounted && (
        <MobileDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          navigation={navigation}
          isActive={isActive}
          isDarkTheme={isDarkTheme}
          toggleTheme={toggleTheme}
          mounted={mounted}
        />
      )}
    </>
  );
}

/* ── Mobile Drawer ── */

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  navigation: NavigationItem[];
  isActive: (item: NavigationItem) => boolean;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  mounted: boolean;
}

function MobileDrawer({ open, onClose, navigation, isActive, isDarkTheme, toggleTheme, mounted }: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`cg-drawer-backdrop ${open ? "cg-drawer-backdrop--open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel — slides down from below the sticky top nav.
          The nav stays visible above, so the hamburger ↔ close X toggle
          lives in the nav itself. No duplicate logo/close header inside
          the panel. */}
      <div
        ref={drawerRef}
        className={`cg-drawer ${open ? "cg-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Nav links */}
        {/* Search is a top-level affordance in the nav itself on mobile
            (search icon next to the hamburger) — no duplicate search
            control inside the drawer. This prevents the "two inputs,
            tap one and focus jumps" confusion that the original drawer
            search caused. */}
        <nav className="cg-drawer-nav">
          {navigation.map((item) =>
            item.external ? (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="cg-drawer-link"
                onClick={onClose}
              >
                {item.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
              </a>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className={`cg-drawer-link ${isActive(item) ? "cg-drawer-link--active" : ""}`}
                onClick={onClose}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        {/* Footer: auth + theme */}
        <div className="cg-drawer-footer">
          {isAuthLoaded &&
            (isSignedIn ? (
              <UserMenu />
            ) : (
              <div className="cg-drawer-auth">
                <SignUpButton mode="modal">
                  <button type="button" className="cg-drawer-signup-btn">
                    Sign Up
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button type="button" className="cg-drawer-signin-link">
                    Sign In
                  </button>
                </SignInButton>
              </div>
            ))}
          <div className="cg-drawer-footer-row">
            {mounted && (
              <button type="button" className="cg-drawer-footer-link" onClick={toggleTheme}>
                {isDarkTheme ? <SunIcon /> : <MoonIcon />}
                {isDarkTheme ? "Light mode" : "Dark mode"}
              </button>
            )}
            <a
              href="https://github.com/TextureHQ/commongrid"
              target="_blank"
              rel="noopener noreferrer"
              className="cg-drawer-footer-link"
              onClick={onClose}
            >
              <GitHubIcon /> GitHub
            </a>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
