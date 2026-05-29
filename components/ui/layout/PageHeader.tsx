import Link from "next/link";
import type { ReactNode } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Optional breadcrumb trail */
  breadcrumbs?: BreadcrumbItem[];
  /** Optional right-side actions (buttons, etc.) */
  actions?: ReactNode;
}

/**
 * PageHeader — Flexible page header with breadcrumbs, title, subtitle, and actions.
 *
 * Provides a consistent header layout that stacks breadcrumbs above the title,
 * and positions actions on the right (or stacks them below on mobile).
 *
 * @example
 * ```tsx
 * <PageHeader
 *   breadcrumbs={[
 *     { label: "Home", href: "/" },
 *     { label: "About" }
 *   ]}
 *   title="About CommonGrid"
 *   subtitle="The energy industry's shared infrastructure record."
 *   actions={<Button>Create Account</Button>}
 * />
 * ```
 */
export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 sm:mb-10 lg:mb-12">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tracking-wide text-text-caption"
          aria-label="Breadcrumb"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="contents">
              {i > 0 && <span className="opacity-50">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-brand-primary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-text-muted">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title + Actions */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 font-brand text-[clamp(28px,3.5vw,42px)] font-semibold leading-tight tracking-tight text-text-heading">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm leading-relaxed text-text-muted">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="shrink-0 self-start">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
