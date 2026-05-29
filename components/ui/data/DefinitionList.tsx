import type { ReactNode } from "react";

interface Definition {
  term: string;
  description: ReactNode;
}

interface DefinitionListProps {
  /** Definitions to display */
  items: Definition[];
  /** Additional className to apply to the wrapper */
  className?: string;
}

/**
 * DefinitionList — Formatted dl/dt/dd for term-description pairs.
 *
 * Creates a semantic definition list with consistent styling for terms
 * and descriptions, commonly used for data source lists or glossaries.
 *
 * @example
 * ```tsx
 * <DefinitionList
 *   items={[
 *     { term: "EIA-860", description: "Annual Electric Generator Report" },
 *     { term: "HIFLD", description: "Homeland Infrastructure Foundation" },
 *   ]}
 * />
 * ```
 */
export function DefinitionList({ items, className = "" }: DefinitionListProps) {
  return (
    <dl className={`space-y-4 ${className}`}>
      {items.map((item) => (
        <div key={item.term} className="flex flex-col gap-1">
          <dt className="text-sm font-semibold text-text-heading">{item.term}</dt>
          <dd className="text-sm leading-relaxed text-text-muted">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
