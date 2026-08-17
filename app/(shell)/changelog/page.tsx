"use client";

import { Badge, Kpi, KpiGroup } from "@texturehq/edges";
import { useState } from "react";
import { PageHeader, PageShell } from "@/components/ui/layout";
import { getChangelog } from "@/lib/data";
import type { ChangelogEntry, ChangelogOperation } from "@/types/changelog";
import "./changelog.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

const INITIAL_GROUPS = 5;
const LOAD_MORE_GROUPS = 5;

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDateHeader(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatLastUpdated(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Group entries by calendar date (UTC) */
function groupByDate(entries: ChangelogEntry[]): Array<{ date: string; entries: ChangelogEntry[] }> {
  const groups = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const date = formatDateHeader(entry.isoTimestamp);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)?.push(entry);
  }
  return Array.from(groups.entries()).map(([date, groupEntries]) => ({
    date,
    entries: groupEntries,
  }));
}

function getBadgeVariant(kind: ChangelogOperation): "info" | "success" | "warning" | "default" {
  switch (kind) {
    case "updated":
      return "info";
    case "added":
      return "success";
    case "corrected":
      return "warning";
    case "synced":
      return "default";
    default:
      return "info";
  }
}

function getBadgeLabel(kind: ChangelogOperation): string {
  switch (kind) {
    case "updated":
      return "Updated";
    case "added":
      return "New";
    case "corrected":
      return "Corrected";
    case "synced":
      return "Synced";
    default:
      return "Updated";
  }
}

function getDotClass(kind: ChangelogOperation): string {
  return `cl-dot cl-dot-${kind}`;
}

/** Extract a source tag from the entry. Uses explicit source field, or infers from detail text. */
function getSourceTag(entry: ChangelogEntry): string | null {
  if (entry.source) return entry.source;
  // Infer from detail text or entityTypeLabel
  const detail = entry.detail.toLowerCase();
  if (detail.includes("eia-860") || detail.includes("eia 860")) return "EIA-860";
  if (detail.includes("eia-861") || detail.includes("eia 861")) return "EIA-861";
  if (detail.includes("ferc")) return "FERC";
  if (detail.includes("afdc")) return "AFDC";
  if (detail.includes("hifld")) return "HIFLD";
  if (detail.includes("nerc")) return "NERC";
  // Fall back to entityTypeLabel if it looks like a source
  const label = entry.entityTypeLabel?.toUpperCase();
  if (label && !["IOU", "CO-OP", "MUNI"].includes(label)) return label;
  return null;
}

/** Get display author. Uses explicit author field, or "commongrid-bot" for synced entries. */
function getAuthor(entry: ChangelogEntry): string | null {
  if (entry.author) return entry.author;
  if (entry.kind === "synced") return "commongrid-bot";
  return null;
}

// ── Components ────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const sourceTag = getSourceTag(entry);
  const author = getAuthor(entry);

  return (
    <div className="cl-entry">
      <div className={getDotClass(entry.kind)} />
      <div className="cl-entry-body">
        <div className="cl-entry-head">
          <span className="cl-entry-name">{entry.name}</span>
          <Badge variant={getBadgeVariant(entry.kind)} size="sm">
            {getBadgeLabel(entry.kind)}
          </Badge>
        </div>
        <div className="cl-entry-detail">{entry.detail}</div>
        <div className="cl-entry-meta">
          {sourceTag && <span className="cl-source-tag">{sourceTag}</span>}
          {author && <span className="cl-author">by {author}</span>}
        </div>
      </div>
      <div className="cl-entry-time">{formatRelativeTime(entry.isoTimestamp)}</div>
    </div>
  );
}

function DateGroup({ date, entries }: { date: string; entries: ChangelogEntry[] }) {
  return (
    <div className="cl-date-group">
      <div className="cl-date-header">
        <span className="cl-date">{date}</span>
        <span className="cl-date-count">
          {entries.length} change{entries.length !== 1 ? "s" : ""}
        </span>
      </div>
      {entries.map((entry) => (
        <EntryRow key={`${entry.kind}:${entry.slug}:${entry.isoTimestamp}`} entry={entry} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  const changelog = getChangelog();
  const [visibleGroups, setVisibleGroups] = useState(INITIAL_GROUPS);

  // Merge and sort all entries newest-first
  const allEntries = [...changelog.recentlyUpdated, ...changelog.newlyAdded].sort(
    (a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime()
  );

  const groups = groupByDate(allEntries);
  const hasMore = visibleGroups < groups.length;

  // Compute stats
  const updatedCount = allEntries.filter(
    (e) => e.kind === "updated" || e.kind === "corrected" || e.kind === "synced"
  ).length;
  const newCount = allEntries.filter((e) => e.kind === "added").length;
  // Every entry in the feed, not a time-windowed figure. The label used to say
  // "this week" while counting all of them, which read as a busy week when the
  // newest entry was months old.
  const totalCount = allEntries.length;

  const _lastUpdated = changelog.updatedAt ? formatLastUpdated(changelog.updatedAt) : null;

  return (
    <PageShell className="cg-changelog">
      <PageHeader title="Changelog" subtitle="Recent changes to CommonGrid data" />

      {/* Stats band */}
      <KpiGroup cols={{ base: 3 }} gap="md" className="cl-stats-kpi">
        <Kpi label="Updated" value={updatedCount} size="lg" />
        <Kpi label="Newly added" value={newCount} size="lg" />
        <Kpi label="Total changes" value={totalCount} size="lg" />
      </KpiGroup>

      {/* Feed */}
      {allEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)", fontSize: "14px" }}>
          <p>
            No changes recorded yet. Run{" "}
            <code
              style={{
                fontFamily: "var(--font-family-mono)",
                fontSize: "12px",
                background: "var(--color-border-default)",
                padding: "2px 6px",
                borderRadius: "3px",
              }}
            >
              npm run generate:changelog
            </code>{" "}
            after a sync to populate this feed.
          </p>
        </div>
      ) : (
        <>
          {groups.slice(0, visibleGroups).map(({ date, entries }) => (
            <DateGroup key={date} date={date} entries={entries} />
          ))}

          {hasMore && (
            <div className="cl-load-more">
              <button type="button" onClick={() => setVisibleGroups((v) => v + LOAD_MORE_GROUPS)}>
                Load older changes
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
