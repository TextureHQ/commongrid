import Link from "next/link";

/**
 * Individual entity list item
 */
export interface EntityListItem {
  href: string;
  name: string;
  /** Optional colored dot */
  dotColor?: string;
  /** Optional badge component */
  badge?: React.ReactNode;
  /** Optional meta text (right side) */
  meta?: string;
}

/**
 * EntityList - Vertical list of clickable entity rows
 *
 * Supports optional colored dots, badges, and metadata.
 * Shows first N items with "X more" footer if overflow.
 */
interface EntityListProps {
  /** Array of entity items to display */
  items: EntityListItem[];
  /** Maximum items to show before truncating */
  maxItems?: number;
  /** Optional header meta text (e.g., "32 plants · 4.1 GW") */
  headerMeta?: string;
}

export function EntityList({ items, maxItems, headerMeta }: EntityListProps) {
  if (items.length === 0) return null;

  const visibleItems = maxItems ? items.slice(0, maxItems) : items;
  const hasMore = maxItems && items.length > maxItems;
  const moreCount = hasMore ? items.length - maxItems : 0;

  return (
    <div className="space-y-2">
      {headerMeta && <div className="text-text-caption text-sm mb-3">{headerMeta}</div>}

      {visibleItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg hover:bg-background-muted transition-colors border border-transparent hover:border-border-default"
        >
          <div className="flex items-center gap-3 min-w-0">
            {item.dotColor && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.dotColor }}
                aria-hidden="true"
              />
            )}
            <span className="text-text-body font-medium truncate">{item.name}</span>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {item.badge}
            {item.meta && <span className="text-text-caption text-sm font-mono">{item.meta}</span>}
          </div>
        </Link>
      ))}

      {hasMore && <div className="text-text-muted text-sm text-center py-2">{moreCount} more</div>}
    </div>
  );
}
