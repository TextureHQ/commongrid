"use client";

import Link from "next/link";

const GITHUB_BASE = "https://github.com/TextureHQ/commongrid/blob/main";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DetailPageShellProps {
  /** Mono uppercase kicker text, e.g. "Electric Utility" */
  kicker: React.ReactNode;
  /** Optional colored dot to show in the kicker */
  kickerDotColor?: string;
  /** Large brand-font entity name */
  entityName: string;
  /** Subtitle row under the name (short name, website, etc.) */
  subtitle?: React.ReactNode;
  breadcrumbs: BreadcrumbItem[];
  /** EntityActions component */
  actions?: React.ReactNode;
  /** Avatar/logo element */
  avatar?: React.ReactNode;
  /** Source data file paths to link on GitHub */
  dataSourcePaths?: string[];
  children: React.ReactNode;
}

export function DetailPageShell({
  kicker,
  kickerDotColor,
  entityName,
  subtitle,
  breadcrumbs,
  actions,
  avatar,
  dataSourcePaths,
  children,
}: DetailPageShellProps) {
  return (
    <div className="cg-detail">
      {/* ── Page header (above card) ── */}
      <div className="detail-header">
        <div className="wrap">
          {/* Breadcrumb */}
          <nav className="detail-breadcrumb" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.label} style={{ display: "contents" }}>
                {i > 0 && <span className="sep">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span className="current">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          {/* Main header row */}
          <div className="detail-header-main">
            <div className="detail-header-identity">
              {avatar && <div className="detail-avatar-wrap">{avatar}</div>}
              <div style={{ minWidth: 0 }}>
                <div className="detail-kicker">
                  {kickerDotColor && <span className="kicker-dot" style={{ backgroundColor: kickerDotColor }} />}
                  {kicker}
                </div>
                <h1 className="detail-name">{entityName}</h1>
                {subtitle && <div className="detail-sub">{subtitle}</div>}
              </div>
            </div>

            {actions && (
              <div className="detail-header-actions" style={{ flexShrink: 0 }}>
                {actions}
              </div>
            )}
          </div>

          {/* Data source */}
          {dataSourcePaths && dataSourcePaths.length > 0 && (
            <div className="detail-source">
              {dataSourcePaths.map((path) => {
                const fileName = path.split("/").pop() ?? path;
                return (
                  <a key={path} href={`${GITHUB_BASE}/${path}`} target="_blank" rel="noopener noreferrer">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                    </svg>
                    {fileName}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Body (card) ── */}
      <div className="detail-body">
        <div className="wrap">
          <div className="detail-card">{children}</div>
        </div>
      </div>
    </div>
  );
}
