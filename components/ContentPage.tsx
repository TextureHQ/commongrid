"use client";

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
 * ContentPage — backwards-compatible compound wrapper around
 * `PageShell` + `PageHeader`. Prefer using `PageShell` / `PageHeader`
 * directly in new code; this component exists to keep older consumers
 * (Contributions, Developers, etc.) working unchanged.
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
