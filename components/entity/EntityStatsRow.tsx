/**
 * Individual stat item with value and label
 */
interface StatItem {
  value: React.ReactNode;
  label: string;
}

/**
 * EntityStatsRow - Display 2-4 key metrics in a horizontal row
 *
 * Responsive grid: 2 columns on mobile, 4 columns on desktop.
 * Automatically filters out null/empty values.
 */
interface EntityStatsRowProps {
  /** Array of stat items to display */
  stats: StatItem[];
}

export function EntityStatsRow({ stats }: EntityStatsRowProps) {
  // Filter out null/undefined/empty values
  const filtered = stats.filter(
    (stat) => stat.value !== null && stat.value !== undefined && stat.value !== "" && stat.value !== "—"
  );

  if (filtered.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-8 border-b border-border-default">
      {filtered.map((stat) => (
        <div key={stat.label} className="flex flex-col">
          <div className="text-3xl md:text-4xl font-semibold text-text-heading tabular-nums">{stat.value}</div>
          <div className="text-xs uppercase tracking-wide text-text-muted mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
