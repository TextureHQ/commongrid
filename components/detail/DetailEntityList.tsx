import Link from "next/link";

export interface EntityListItem {
  href: string;
  name: string;
  /** Filled circle dot color */
  dotColor?: string;
  /** Badge or tag node rendered on the right */
  badge?: React.ReactNode;
  /** Mono meta text on the right */
  meta?: string;
}

interface DetailEntityListProps {
  items: EntityListItem[];
  maxItems?: number;
  /** Optional header text, e.g. "32 plants · 4.1 GW" */
  headerMeta?: string;
}

export function DetailEntityList({ items, maxItems = 40, headerMeta }: DetailEntityListProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxItems);
  const overflow = items.length - visible.length;

  return (
    <div className="detail-entity-list">
      {headerMeta && (
        <div className="detail-entity-list-head">
          <span>{headerMeta}</span>
        </div>
      )}
      {visible.map((item) => (
        <Link key={item.href} href={item.href} className="detail-entity-row">
          <div className="detail-entity-row-left">
            {item.dotColor && <span className="detail-entity-dot" style={{ backgroundColor: item.dotColor }} />}
            <span className="detail-entity-name">{item.name}</span>
          </div>
          <div className="detail-entity-row-right">
            {item.badge}
            {item.meta && <span className="detail-entity-meta">{item.meta}</span>}
          </div>
        </Link>
      ))}
      {overflow > 0 && <div className="detail-entity-more">+ {overflow} more</div>}
    </div>
  );
}
