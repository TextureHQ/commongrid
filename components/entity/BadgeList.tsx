import { Badge, type BadgeProps } from "@texturehq/edges";

/**
 * BadgeList - Horizontal row of badges with wrapping
 *
 * Used for technologies, activities, connector types, etc.
 * Responsive: wraps naturally on all screen sizes.
 */
interface BadgeListProps {
  /** Array of badge text items */
  items: string[];
  /** Badge variant */
  variant?: BadgeProps["variant"];
  /** Optional section label */
  label?: string;
}

export function BadgeList({ items, variant = "neutral", label }: BadgeListProps) {
  if (items.length === 0) return null;

  return (
    <div>
      {label && <div className="text-text-caption text-xs uppercase tracking-wide mb-3">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant={variant}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
