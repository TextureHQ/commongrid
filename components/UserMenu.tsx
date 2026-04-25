"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Badge } from "@texturehq/edges";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/* ── Icons ─────────────────────────────────────────────────────────────────── */

const SettingsIcon = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const ContributionsIcon = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const KeyIcon = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const SignOutIcon = () => (
  <svg
    aria-hidden="true"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />
  </svg>
);

/* ── Component ─────────────────────────────────────────────────────────────── */

export function UserMenu() {
  const { user: clerkUser } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { user: cgUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!clerkUser) return null;

  const displayName = cgUser?.displayName || clerkUser.fullName || clerkUser.firstName || "User";
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? cgUser?.email ?? null;
  const avatarUrl = clerkUser.imageUrl ?? cgUser?.avatarUrl ?? null;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isAdmin = cgUser?.role === "admin";
  const isMod = cgUser?.role === "moderator";

  return (
    <div className="cg-user-menu" ref={menuRef}>
      {/* Role badge (outside the menu trigger) */}
      {(isAdmin || isMod) && (
        <Badge size="sm" shape="pill" variant={isAdmin ? "error" : "info"}>
          {isAdmin ? "Admin" : "Mod"}
        </Badge>
      )}

      {/* Avatar trigger */}
      <button type="button" className="cg-user-trigger" onClick={toggle} aria-expanded={open} aria-haspopup="true">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            className="cg-user-avatar"
            referrerPolicy="no-referrer"
            unoptimized
          />
        ) : (
          <span className="cg-user-avatar cg-user-avatar-fallback">{initials}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="cg-user-dropdown" role="menu">
          {/* User info header */}
          <div className="cg-user-header">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={36}
                height={36}
                className="cg-user-header-avatar"
                referrerPolicy="no-referrer"
                unoptimized
              />
            ) : (
              <span className="cg-user-header-avatar cg-user-avatar-fallback">{initials}</span>
            )}
            <div className="cg-user-header-info">
              <div className="cg-user-header-name">{displayName}</div>
              {email && <div className="cg-user-header-email">{email}</div>}
            </div>
          </div>

          <div className="cg-user-divider" />

          {/* Menu items */}
          <div className="cg-user-items">
            <Link href="/contributions" className="cg-user-item" role="menuitem" onClick={() => setOpen(false)}>
              <ContributionsIcon />
              <span>My contributions</span>
            </Link>

            <button
              type="button"
              className="cg-user-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openUserProfile();
              }}
            >
              <SettingsIcon />
              <span>Manage account</span>
            </button>

            <Link href="/developers" className="cg-user-item" role="menuitem" onClick={() => setOpen(false)}>
              <KeyIcon />
              <span>API keys</span>
            </Link>

            {(isAdmin || isMod) && (
              <Link href="/mod" className="cg-user-item" role="menuitem" onClick={() => setOpen(false)}>
                <ShieldIcon />
                <span>Moderation</span>
              </Link>
            )}
          </div>

          <div className="cg-user-divider" />

          <div className="cg-user-items">
            <button
              type="button"
              className="cg-user-item cg-user-item-danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <SignOutIcon />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
