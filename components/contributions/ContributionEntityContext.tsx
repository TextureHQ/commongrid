import Link from "next/link";
import type { ContributionEntityContext as EntityContext } from "@/lib/mod/contribution-context";

export function ContributionEntityContext({ context }: { context?: EntityContext }) {
  if (!context) return null;
  return (
    <div className="min-w-0 space-y-1 break-words">
      <div className="font-medium text-text-heading">{context.name}</div>
      {context.href ? (
        <Link
          href={context.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline text-text-body"
        >
          View entity (opens in a new tab)
        </Link>
      ) : (
        <div className="text-sm text-text-muted">
          {context.availability === "new"
            ? "New entity — not published yet"
            : context.availability === "unavailable"
              ? "Entity unavailable"
              : "No standalone entity page"}
        </div>
      )}
    </div>
  );
}
