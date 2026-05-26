interface DetailSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function DetailSection({ id, title, children, className = "" }: DetailSectionProps) {
  return (
    <section id={id} className={`detail-section ${className}`}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}
