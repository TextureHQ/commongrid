import { Icon } from "@texturehq/edges";
import Link from "next/link";

/**
 * Individual relationship item
 */
export interface RelationshipItem {
  /** Label (e.g., "ISO", "Parent Utility") */
  label: string;
  /** Entity name */
  name: string;
  /** Optional meta text */
  meta?: string;
  /** Optional link href */
  href?: string;
}

/**
 * RelationshipCards - Display related entities as clickable cards
 *
 * Shows 2-column grid on desktop, single column on mobile.
 * Includes arrow icon for linked cards.
 */
interface RelationshipCardsProps {
  /** Array of relationship items */
  items: RelationshipItem[];
}

export function RelationshipCards({ items }: RelationshipCardsProps) {
  if (items.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {items.map((item) => {
        const body = (
          <div className="flex flex-col gap-1 min-w-0">
            <div className="text-label-sm uppercase tracking-wide text-text-caption">{item.label}</div>
            <div className="text-heading-sm font-medium text-text-body truncate">{item.name}</div>
            {item.meta && <div className="text-body-sm text-text-muted">{item.meta}</div>}
          </div>
        );

        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border-muted hover:border-border-default transition-colors group"
            >
              {body}
              <Icon
                name="ArrowRight"
                size="sm"
                className="flex-shrink-0 text-text-muted group-hover:text-text-body group-hover:translate-x-0.5 transition-all"
              />
            </Link>
          );
        }

        return (
          <div
            key={item.label}
            className="flex items-center px-4 py-3 rounded-lg border border-border-muted"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
