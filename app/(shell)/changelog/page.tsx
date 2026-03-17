"use client";

import { Badge, Card, Icon, PageLayout, Section } from "@texturehq/edges";
import { useMemo, useState } from "react";
import { getChangelog } from "@/lib/data";
import type { ChangelogEntry } from "@/types/changelog";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-purple-100 text-purple-600",
  "bg-teal-100 text-teal-600",
  "bg-orange-100 text-orange-600",
  "bg-sky-100 text-sky-600",
  "bg-green-100 text-green-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-indigo-100 text-indigo-600",
  "bg-emerald-100 text-emerald-600",
  "bg-lime-100 text-lime-600",
  "bg-cyan-100 text-cyan-600",
  "bg-violet-100 text-violet-600",
] as const;

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Group entries by calendar date (local) */
function groupByDate(entries: ChangelogEntry[]): Array<{ date: string; entries: ChangelogEntry[] }> {
  const groups = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const date = formatDate(entry.isoTimestamp);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(entry);
  }
  return Array.from(groups.entries()).map(([date, entries]) => ({ date, entries }));
}

// ── Components ────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const color = avatarColor(entry.name);
  const initial = entry.name.charAt(0).toUpperCase();

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border-default last:border-0">
      {/* Avatar */}
      <div
        className={`flex-none w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold mt-0.5 ${color}`}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-text-heading">{entry.name}</span>
          <Badge
            size="sm"
            shape="pill"
            variant={entry.kind === "added" ? "success" : "info"}
          >
            {entry.kind === "added" ? "New" : "Updated"}
          </Badge>
        </div>
        <div className="text-sm text-text-muted">{entry.detail}</div>
      </div>

      {/* Time */}
      <div className="flex-none text-xs text-text-muted tabular-nums whitespace-nowrap mt-1">
        {formatRelativeTime(entry.isoTimestamp)}
      </div>
    </div>
  );
}

function DateGroup({ date, entries }: { date: string; entries: ChangelogEntry[] }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">{date}</div>
        <div className="flex-1 h-px bg-border-default" />
        <div className="text-xs text-text-muted">{entries.length} change{entries.length !== 1 ? "s" : ""}</div>
      </div>
      <Card variant="outlined">
        <Card.Content className="p-0 px-6">
          {entries.map((entry) => (
            <EntryRow key={`${entry.kind}:${entry.entityType}:${entry.slug}`} entry={entry} />
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  const changelog = getChangelog();
  const [tab, setTab] = useState<"data" | "site">("data");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Merge and sort all entries newest-first
  const allEntries = useMemo(
    () =>
      [...changelog.recentlyUpdated, ...changelog.newlyAdded].sort(
        (a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime(),
      ),
    [changelog],
  );

  // Unique entity types for filter chips
  const uniqueEntityTypes = useMemo(() => {
    const types = new Set(allEntries.map((e) => e.entityType));
    return Array.from(types).sort();
  }, [allEntries]);

  // Filtered entries (by entity type + search)
  const filteredEntries = useMemo(() => {
    let result = allEntries;
    if (entityTypeFilter !== "all") {
      result = result.filter((e) => e.entityType === entityTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) => e.name.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allEntries, entityTypeFilter, searchQuery]);

  const groups = groupByDate(filteredEntries);

  const lastUpdated = changelog.updatedAt
    ? new Date(changelog.updatedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <PageLayout maxWidth={900}>
      <PageLayout.Header
        title="Changelog"
        description="What's changing in the grid data we track — and in the tools we're building to track it."
      />
      <PageLayout.Content>
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border-default mb-6">
          <button
            type="button"
            onClick={() => setTab("data")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "data"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-muted hover:text-text-body"
            }`}
          >
            Data Changes
          </button>
          <button
            type="button"
            onClick={() => setTab("site")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "site"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-muted hover:text-text-body"
            }`}
          >
            Site Updates
          </button>
        </div>

        {tab === "site" && (
          <Card variant="outlined">
            <Card.Content className="py-12 text-center">
              <Icon name="Code" size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm font-medium text-text-heading mb-1">Product Updates</p>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                Changes to the CommonGrid website and tools. Visit our{" "}
                <a
                  href="https://github.com/TextureHQ/commongrid/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-primary hover:underline"
                >
                  GitHub releases
                </a>{" "}
                for the full history of site updates.
              </p>
            </Card.Content>
          </Card>
        )}

        {tab === "data" && (
        <Section id="feed" navLabel="Changes" withDivider={false}>
          {/* Search */}
          <div className="relative mb-4">
            <Icon name="MagnifyingGlass" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search changes..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-default bg-background-surface text-sm text-text-body placeholder:text-text-muted outline-none focus:border-brand-primary transition-colors"
            />
          </div>

          {/* Meta bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-text-muted">
                Synced from authoritative sources daily
              </span>
            </div>
            {lastUpdated && (
              <span className="text-xs text-text-muted">
                Last updated {lastUpdated}
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {[
              {
                label: "Recently updated",
                value: changelog.recentlyUpdated.length,
                icon: "ArrowCounterClockwise" as const,
                color: "text-blue-500",
                bg: "bg-blue-50",
              },
              {
                label: "Newly added",
                value: changelog.newlyAdded.length,
                icon: "Plus" as const,
                color: "text-green-500",
                bg: "bg-green-50",
              },
              {
                label: "Total changes",
                value: allEntries.length,
                icon: "ListBullets" as const,
                color: "text-text-muted",
                bg: "bg-background-subtle",
              },
            ].map((stat) => (
              <Card key={stat.label} variant="outlined">
                <Card.Content className="p-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center flex-none`}>
                    <Icon name={stat.icon} size={16} className={stat.color} />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-text-heading tabular-nums">{stat.value}</div>
                    <div className="text-xs text-text-muted">{stat.label}</div>
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>

          {/* Entity type filters */}
          {uniqueEntityTypes.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {["all", ...uniqueEntityTypes].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEntityTypeFilter(type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    entityTypeFilter === type
                      ? "bg-brand-primary text-white"
                      : "bg-background-subtle text-text-muted hover:text-text-body"
                  }`}
                >
                  {type === "all" ? "All" : type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </button>
              ))}
            </div>
          )}

          {/* Feed */}
          {filteredEntries.length === 0 ? (
            <Card variant="outlined">
              <Card.Content className="py-12 text-center">
                <Icon name="Clock" size={32} className="text-text-muted mx-auto mb-3" />
                <p className="text-text-muted text-sm">
                  No changes recorded yet. Run{" "}
                  <code className="text-xs bg-background-subtle px-1.5 py-0.5 rounded">
                    npm run generate:changelog
                  </code>{" "}
                  after a sync to populate this feed.
                </p>
              </Card.Content>
            </Card>
          ) : (
            groups.map(({ date, entries }) => (
              <DateGroup key={date} date={date} entries={entries} />
            ))
          )}
        </Section>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
