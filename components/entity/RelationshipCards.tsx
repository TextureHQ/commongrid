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
    <div className="grid md:grid-cols-2 gap-4">
      {items.map((item) => {
        const content = (
          <>
            <div className="text-label-sm uppercase tracking-wide text-text-caption">{item.label}</div>
            <div className="text-heading-md font-medium text-text-body">{item.name}</div>
            {item.meta && <div className="text-body-sm text-text-muted">{item.meta}</div>}
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex flex-col gap-1 p-4 rounded-lg border border-border-default hover:border-border-focus hover:bg-background-muted transition-all group"
            >
              {content}
              <Icon
                name="ArrowRight"
                size="sm"
                className="ml-auto text-text-muted group-hover:text-brand-primary group-hover:translate-x-1 transition-all"
              />
            </Link>
          );
        }

        return (
          <div
            key={item.label}
            className="flex flex-col gap-1 p-4 rounded-lg border border-border-muted bg-background-muted"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
