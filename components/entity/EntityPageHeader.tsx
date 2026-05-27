import { BreadcrumbItem, Breadcrumbs } from "@texturehq/edges";

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
 * Responsive: stacks naturally on mobile, horizontal layout on desktop.
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
    <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12 py-6">
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
          {avatar && <div className="flex-shrink-0">{avatar}</div>}

          <div className="min-w-0 flex-1">
            <h1 className="text-heading-lg font-semibold text-text-heading mb-2">{entityName}</h1>

            {subtitle && (
              <div className="text-body-md text-text-body flex items-center gap-2 flex-wrap">{subtitle}</div>
            )}
          </div>
        </div>

        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {/* Data sources */}
      {dataSourcePaths && dataSourcePaths.length > 0 && (
        <div className="flex items-center gap-3 text-caption text-text-caption mt-4">
          {dataSourcePaths.map((path) => {
            const fileName = path.split("/").pop() ?? path;
            return (
              <a
                key={path}
                href={`${GITHUB_BASE}/${path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-text-muted transition-colors"
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
    </div>
  );
}
