"use client";

import type { ReactNode } from "react";
import "./ContentPage.css";

interface ContentPageHeaderProps {
  /** Optional small uppercase kicker above the title */
  kicker?: string;
  /** Page title */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional right-side actions */
  actions?: ReactNode;
  /** Optional breadcrumbs */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

interface ContentPageProps {
  children: ReactNode;
  /** Additional className on the wrapper */
  className?: string;
}

export function ContentPage({ children, className }: ContentPageProps) {
  return <div className={`cg-content-page ${className || ""}`}>{children}</div>;
}

function Header({ kicker, title, subtitle, actions, breadcrumbs }: ContentPageHeaderProps) {
  return (
    <header className="cg-content-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="cg-content-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label}>
              {i > 0 && <span className="cg-content-breadcrumb-sep">/</span>}
              {crumb.href ? (
                <a href={crumb.href}>{crumb.label}</a>
              ) : (
                <span className="cg-content-breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="cg-content-header-main">
        <div className="cg-content-header-text">
          {kicker && <div className="cg-content-kicker">{kicker}</div>}
          <h1 className="cg-content-title">{title}</h1>
          {subtitle && <p className="cg-content-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="cg-content-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="cg-content-body">{children}</div>;
}

ContentPage.Header = Header;
ContentPage.Body = Body;

export { Header as ContentPageHeader, Body as ContentPageBody };
