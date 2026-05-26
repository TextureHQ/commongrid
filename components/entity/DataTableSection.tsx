/**
 * DataTableSection - Wrapper for Edges DataTable with consistent header
 *
 * Provides consistent styling and meta header for data tables.
 */
interface DataTableSectionProps {
  /** Count of items */
  count: number;
  /** Singular label (e.g., "utility") */
  singularLabel: string;
  /** Plural label (e.g., "utilities") */
  pluralLabel: string;
  /** DataTable component */
  children: React.ReactNode;
}

export function DataTableSection({ count, singularLabel, pluralLabel, children }: DataTableSectionProps) {
  const label = count === 1 ? singularLabel : pluralLabel;

  return (
    <div className="space-y-4">
      <div className="text-text-caption text-sm">
        {count} {label}
      </div>
      <div className="rounded-lg border border-border-default overflow-hidden">{children}</div>
    </div>
  );
}
