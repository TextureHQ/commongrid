import type { ReactNode } from "react";

interface PageShellProps {
  /** Content to render inside the shell */
  children: ReactNode;
  /** Additional className to apply to the wrapper */
  className?: string;
}

/**
 * PageShell — Max-width container with responsive padding.
 *
 * Provides a consistent 960px max-width layout with responsive padding
 * that scales from mobile (20px) to desktop (56px).
 *
 * @example
 * ```tsx
 * <PageShell>
 *   <PageHeader title="My Page" />
 *   <Section>Content here</Section>
 * </PageShell>
 * ```
 */
export function PageShell({ children, className = "" }: PageShellProps) {
  return (
    <div className={`mx-auto w-full max-w-[960px] px-5 py-8 sm:px-8 sm:py-12 lg:px-14 lg:py-16 ${className}`}>
      {children}
    </div>
  );
}
