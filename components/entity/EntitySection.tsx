/**
 * EntitySection - Wrapper for each section with numbered kicker and title
 *
 * Provides consistent spacing and styling for content sections.
 */
interface EntitySectionProps {
  /** Section ID for anchor links */
  id: string;
  /** Optional kicker text (e.g., "01 · Overview") */
  kicker?: string;
  /** Section title (h2) */
  title: string;
  /** Section content */
  children: React.ReactNode;
}

export function EntitySection({ id, kicker, title, children }: EntitySectionProps) {
  return (
    <section id={id} className="py-10 border-b border-border-muted last:border-b-0">
      {kicker && <div className="text-text-caption text-xs uppercase tracking-wider font-mono mb-2">{kicker}</div>}
      <h2 className="text-text-heading text-2xl font-semibold mb-6">{title}</h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
