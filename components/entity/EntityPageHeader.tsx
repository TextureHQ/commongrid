import { BreadcrumbItem, Breadcrumbs } from "@texturehq/edges";
import { PageShell } from "../ui/layout/PageShell";

/**
 * Breadcrumb item with optional link
 */
interface Breadcrumb {
  label: string;
  href?: string;
}

/**
 * EntityPageHeader - Unified header for all entity detail pages
 *
 * Provides breadcrumbs, title, subtitle, avatar, and actions.
 * Uses PageShell for consistent max-width container layout.
 * Extends the base PageHeader pattern with avatar and data source links.
 */
interface EntityPageHeaderProps {
  /** Breadcrumb navigation items */
  breadcrumbs: Breadcrumb[];
  /** Main entity name (h1) */
  entityName: string;
  /** Optional subtitle content (badges, links, etc.) */
  subtitle?: React.ReactNode;
  /** Optional avatar/logo */
  avatar?: React.ReactNode;
  /** Optional action buttons */
  actions?: React.ReactNode;
  /** Optional data source file paths for GitHub links */
  dataSourcePaths?: string[];
}

const GITHUB_BASE = "https://github.com/TextureHQ/commongrid/blob/main";

export function EntityPageHeader({
  breadcrumbs,
  entityName,
  subtitle,
  avatar,
  actions,
  dataSourcePaths,
}: EntityPageHeaderProps) {
  return (
    <PageShell className="py-6">
      {/* Breadcrumbs */}
      <Breadcrumbs className="mb-6">
        {breadcrumbs.map((crumb) => (
          <BreadcrumbItem key={crumb.label} href={crumb.href}>
            {crumb.label}
          </BreadcrumbItem>
        ))}
      </Breadcrumbs>

      {/* Header content */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {avatar && <div className="shrink-0">{avatar}</div>}

          <div className="min-w-0 flex-1">
            <h1 className="mb-2 font-brand text-[clamp(28px,3.5vw,42px)] font-semibold leading-tight tracking-tight text-text-heading">
              {entityName}
            </h1>

            {subtitle && (
              <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-text-body">{subtitle}</div>
            )}
          </div>
        </div>

        {actions && <div className="shrink-0 self-start">{actions}</div>}
      </div>

      {/* Data sources */}
      {dataSourcePaths && dataSourcePaths.length > 0 && (
        <div className="mt-4 flex items-center gap-3 font-mono text-[11px] tracking-wide text-text-caption">
          {dataSourcePaths.map((path) => {
            const fileName = path.split("/").pop() ?? path;
            return (
              <a
                key={path}
                href={`${GITHUB_BASE}/${path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition-colors hover:text-text-muted"
              >
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
    </PageShell>
  );
}
