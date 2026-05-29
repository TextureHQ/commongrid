import type { ReactNode } from "react";

interface SectionProps {
  /** Content to render inside the section */
  children: ReactNode;
  /** Optional section heading */
  heading?: string;
  /** Additional className to apply to the wrapper */
  className?: string;
}

/**
 * Section — Consistent section spacing wrapper with optional heading.
 *
 * Provides vertical spacing between major content blocks and an optional
 * heading styled consistently across the app.
 *
 * @example
 * ```tsx
 * <Section heading="Data Sources">
 *   <p>Content here...</p>
 * </Section>
 * ```
 */
export function Section({ children, heading, className = "" }: SectionProps) {
  return (
    <section className={`mb-12 sm:mb-16 lg:mb-20 ${className}`}>
      {heading && (
        <h2 className="mb-5 font-brand text-[clamp(20px,2.5vw,28px)] font-semibold leading-tight tracking-tight text-text-heading sm:mb-6">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}
