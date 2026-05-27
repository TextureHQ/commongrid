/**
 * EntitySection - Wrapper for each section with clean heading
 *
 * Provides consistent spacing and styling for content sections.
 * No numbered kickers or eyebrow text per Nick's feedback.
 */
interface EntitySectionProps {
  /** Section ID for anchor links */
  id: string;
  /** Section title (h2) */
  title: string;
  /** Section content */
  children: React.ReactNode;
}

export function EntitySection({ id, title, children }: EntitySectionProps) {
  return (
    <section id={id} className="py-10 border-b border-border-muted last:border-b-0">
      <h2 className="text-heading-md font-semibold text-text-heading mb-6">{title}</h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
