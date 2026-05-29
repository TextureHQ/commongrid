import type { ReactNode } from "react";

interface StatGridProps {
  /** Stat items to display */
  children: ReactNode;
  /** Number of columns (2-6) */
  columns?: 2 | 3 | 4 | 5 | 6;
  /** Additional className to apply to the grid */
  className?: string;
}

/**
 * StatGrid — Responsive grid for displaying metric cards.
 *
 * Creates a responsive grid that stacks on mobile and expands to multiple
 * columns on larger screens. Use with StatItem components.
 *
 * @example
 * ```tsx
 * <StatGrid columns={3}>
 *   <StatItem value="1,234" label="Utilities" />
 *   <StatItem value="67" label="Grid Operators" />
 *   <StatItem value="12,345" label="Power Plants" />
 * </StatGrid>
 * ```
 */
export function StatGrid({ children, columns = 3, className = "" }: StatGridProps) {
  const colClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
    6: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  }[columns];

  return <div className={`grid grid-cols-1 gap-4 sm:gap-5 lg:gap-6 ${colClass} ${className}`}>{children}</div>;
}

interface StatItemProps {
  /** Metric value (number or string) */
  value: ReactNode;
  /** Metric label */
  label: string;
  /** Optional icon or decoration */
  icon?: ReactNode;
}

/**
 * StatItem — Individual metric display for StatGrid.
 *
 * @example
 * ```tsx
 * <StatItem value="1,234" label="Utilities" />
 * ```
 */
export function StatItem({ value, label, icon }: StatItemProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {icon && <div className="text-text-caption">{icon}</div>}
      <div className="font-brand text-[clamp(26px,3vw,34px)] font-semibold leading-none tracking-tight text-text-heading">
        {value}
      </div>
      <div className="text-sm text-text-muted">{label}</div>
    </div>
  );
}
