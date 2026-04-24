interface DetailSectionProps {
  id: string;
  /** Mono kicker text, e.g. "01 · Overview" */
  kicker?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function DetailSection({ id, kicker, title, children, className = "" }: DetailSectionProps) {
  return (
    <section id={id} className={`detail-section ${className}`}>
      {kicker && <div className="section-kicker">{kicker}</div>}
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}
