import type { ReactNode } from "react";

interface KeyValueRow {
  key: string;
  value: ReactNode;
}

interface KeyValueTableProps {
  /** Rows to display (key-value pairs) */
  rows: KeyValueRow[];
  /** Additional className to apply to the wrapper */
  className?: string;
}

/**
 * KeyValueTable — Bordered table for displaying field lists.
 *
 * Creates a two-column table with keys on the left and values on the right,
 * commonly used for entity detail pages.
 *
 * @example
 * ```tsx
 * <KeyValueTable
 *   rows={[
 *     { key: "EIA ID", value: "12345" },
 *     { key: "Type", value: "Investor-Owned" },
 *     { key: "State", value: "California" },
 *   ]}
 * />
 * ```
 */
export function KeyValueTable({ rows, className = "" }: KeyValueTableProps) {
  return (
    <div className={`overflow-hidden rounded-lg border border-border-default ${className}`}>
      {rows.map((row, i) => (
        <div
          key={row.key}
          className={`flex justify-between gap-3 px-3 py-2 text-sm ${
            i < rows.length - 1 ? "border-b border-border-default" : ""
          }`}
        >
          <span className="shrink-0 text-text-muted">{row.key}</span>
          <span className="truncate text-right font-mono text-xs font-medium text-text-heading">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
