import type { ReactNode } from "react";
import { PageHeader, PageShell } from "@/components/ui/layout";

interface ContentPageHeaderProps {
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

/**
 * ContentPage — Backward-compatible wrapper that uses PageShell and PageHeader internally.
 *
 * Provides a compound component API for content pages with consistent layout:
 * - ContentPage.Header: Page header with breadcrumbs, title, subtitle, and actions
 * - ContentPage.Body: Content body wrapper
 *
 * @example
 * ```tsx
 * <ContentPage>
 *   <ContentPage.Header
 *     title="My Page"
 *     subtitle="Description"
 *     breadcrumbs={[{ label: "Home", href: "/" }, { label: "My Page" }]}
 *   />
 *   <ContentPage.Body>
 *     <p>Content goes here</p>
 *   </ContentPage.Body>
 * </ContentPage>
 * ```
 */
export function ContentPage({ children, className }: ContentPageProps) {
  return <PageShell className={className}>{children}</PageShell>;
}

function Header({ title, subtitle, actions, breadcrumbs }: ContentPageHeaderProps) {
  return <PageHeader title={title} subtitle={subtitle} actions={actions} breadcrumbs={breadcrumbs} />;
}

function Body({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

ContentPage.Header = Header;
ContentPage.Body = Body;

export { Body as ContentPageBody, Header as ContentPageHeader };
