import Link from "next/link";

export interface RelationshipItem {
  /** Display label, e.g. "ISO", "Balancing Authority" */
  label: string;
  /** Entity name */
  name: string;
  /** Optional secondary text */
  meta?: string;
  /** If provided, the card is a link */
  href?: string;
}

interface DetailRelationshipsProps {
  items: RelationshipItem[];
}

const ArrowIcon = () => (
  <svg
    aria-hidden="true"
    className="detail-rel-arrow"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export function DetailRelationships({ items }: DetailRelationshipsProps) {
  const visible = items.filter((item) => item.name);
  if (visible.length === 0) return null;

  return (
    <div className="detail-rels">
      {visible.map((item) => {
        const inner = (
          <>
            <span className="detail-rel-label">{item.label}</span>
            <span className="detail-rel-name">{item.name}</span>
            {item.meta && <span className="detail-rel-meta">{item.meta}</span>}
            {item.href && (
              <div className="detail-rel-foot">
                <ArrowIcon />
              </div>
            )}
          </>
        );

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} className="detail-rel">
              {inner}
            </Link>
          );
        }

        return (
          <div key={item.label} className="detail-rel-static">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
