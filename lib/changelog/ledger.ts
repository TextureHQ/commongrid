/**
 * Presentation helpers for the homepage activity ledger.
 *
 * The homepage advertises that "every edit is citable, attributed, and
 * reversible", so the rows under that claim have to come from the real
 * changelog (`GET /api/v1/changelog`, the same feed `/changelog` renders).
 * These pure functions map a `ChangelogEntry` onto the compact row shape the
 * homepage table uses, and they exist outside the component so the mapping —
 * especially "an entry with no author must not invent one" — is unit-testable.
 */

import type { ChangelogEntry, ChangelogOperation } from "@/types/changelog";

/** Shown in the Contributor column when the upstream entry has no author. */
export const NO_AUTHOR_PLACEHOLDER = "—";

/**
 * Short op pill labels. Keys are the real `ChangelogOperation` values the API
 * returns; there is no "merge" op, so no pill can claim one.
 */
const OP_LABELS: Record<ChangelogOperation, string> = {
  added: "add",
  updated: "edit",
  corrected: "fix",
  synced: "sync",
};

/** Tailwind classes per op, keyed by the same real operation values. */
const OP_CLASSES: Record<ChangelogOperation, string> = {
  added: "bg-moss-pastel text-feedback-success-text border-moss-base/50",
  updated: "bg-honey-pastel text-feedback-warning-text border-honey-base/50",
  corrected: "bg-ocean-pastel text-feedback-info-text border-ocean-base/50",
  synced: "bg-[color-mix(in_srgb,var(--color-text-heading)_6%,transparent)] text-text-muted border-border-default",
};

export function opLabel(kind: ChangelogOperation): string {
  return OP_LABELS[kind] ?? kind;
}

export function opClassName(kind: ChangelogOperation): string {
  return OP_CLASSES[kind] ?? OP_CLASSES.updated;
}

/**
 * Author display name. Machine sync batches are attributed to the bot (the
 * changelog page does the same); anything else without an author renders a
 * dash. Never a fabricated handle.
 */
export function ledgerAuthor(entry: Pick<ChangelogEntry, "author" | "kind">): string {
  if (entry.author) return entry.author;
  if (entry.kind === "synced") return "commongrid-bot";
  return NO_AUTHOR_PLACEHOLDER;
}

/** Up to two initials for the avatar bubble; empty when there is no author. */
export function authorInitials(author: string): string {
  if (!author || author === NO_AUTHOR_PLACEHOLDER) return "";
  const parts = author
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Compact relative timestamp. `now` is injectable so tests are deterministic. */
export function relativeTime(isoTimestamp: string, now: number = Date.now()): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((now - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export interface LedgerRow {
  key: string;
  kind: ChangelogOperation;
  op: string;
  opClass: string;
  name: string;
  detail: string;
  author: string;
  initials: string;
  typeLabel: string;
  time: string;
}

export function toLedgerRow(entry: ChangelogEntry, now: number = Date.now()): LedgerRow {
  const author = ledgerAuthor(entry);
  return {
    key: `${entry.slug}-${entry.isoTimestamp}`,
    kind: entry.kind,
    op: opLabel(entry.kind),
    opClass: opClassName(entry.kind),
    name: entry.name,
    detail: entry.detail,
    author,
    initials: authorInitials(author),
    typeLabel: (entry.entityTypeLabel || entry.entityType || "").toLowerCase(),
    time: relativeTime(entry.isoTimestamp, now),
  };
}

export function toLedgerRows(entries: ChangelogEntry[], now: number = Date.now()): LedgerRow[] {
  return entries.map((entry) => toLedgerRow(entry, now));
}

/**
 * Counter line under the table. Both numbers are real totals from the feed for
 * their window; a window that hasn't loaded (or failed) is omitted rather than
 * guessed, and an all-quiet period says so instead of asserting activity.
 */
export function formatLedgerCounters(counts: { day: number | null; week: number | null }): string | null {
  const parts: string[] = [];
  if (counts.day !== null) {
    parts.push(`${counts.day === 0 ? "No" : `+${counts.day.toLocaleString()}`} changes in the last 24h`);
  }
  if (counts.week !== null) {
    parts.push(`${counts.week === 0 ? "none" : `+${counts.week.toLocaleString()}`} this week`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
