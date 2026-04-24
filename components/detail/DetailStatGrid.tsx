export interface StatItem {
  value: React.ReactNode;
  label: string;
}

interface DetailStatGridProps {
  stats: StatItem[];
}

export function DetailStatGrid({ stats }: DetailStatGridProps) {
  const visibleStats = stats.filter(
    (s) => s.value !== null && s.value !== undefined && s.value !== "" && s.value !== "—"
  );

  if (visibleStats.length === 0) return null;

  return (
    <div className="detail-stats" style={{ ["--stats-cols" as string]: Math.min(visibleStats.length, 4) }}>
      {visibleStats.map((stat, i) => (
        <div key={i} className="detail-stat">
          <span className="detail-stat-n tabular">{stat.value}</span>
          <span className="detail-stat-l">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
