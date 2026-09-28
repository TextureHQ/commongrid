import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorInitials,
  formatLedgerCounters,
  ledgerAuthor,
  NO_AUTHOR_PLACEHOLDER,
  opClassName,
  opLabel,
  relativeTime,
  toLedgerRow,
} from "@/lib/changelog/ledger";
import type { ChangelogEntry } from "@/types/changelog";

function entry(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    kind: "updated",
    entityType: "utility",
    entityTypeLabel: "Utility",
    name: "Southern California Edison",
    slug: "southern-california-edison",
    detail: "service_area_km2, customers · 2 changes",
    isoTimestamp: "2026-09-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("op pills", () => {
  it("labels only the operations the API can actually return", () => {
    expect(opLabel("added")).toBe("add");
    expect(opLabel("updated")).toBe("edit");
    expect(opLabel("corrected")).toBe("fix");
    expect(opLabel("synced")).toBe("sync");
  });

  it("always resolves to a non-empty class so a pill never renders unstyled", () => {
    for (const kind of ["added", "updated", "corrected", "synced"] as const) {
      expect(opClassName(kind)).not.toBe("");
    }
  });
});

describe("attribution", () => {
  it("uses the author the changelog supplied", () => {
    expect(ledgerAuthor(entry({ author: "vquinn" }))).toBe("vquinn");
  });

  it("attributes machine sync batches to the bot", () => {
    expect(ledgerAuthor(entry({ kind: "synced" }))).toBe("commongrid-bot");
  });

  // The regression this guards: the homepage previously shipped hardcoded rows
  // with invented contributor handles under a heading promising attribution.
  it("renders a dash rather than inventing a contributor when there is no author", () => {
    expect(ledgerAuthor(entry())).toBe(NO_AUTHOR_PLACEHOLDER);
    const row = toLedgerRow(entry());
    expect(row.author).toBe(NO_AUTHOR_PLACEHOLDER);
    expect(row.initials).toBe("");
  });

  it("derives at most two initials from a handle", () => {
    expect(authorInitials("maria.kellogg")).toBe("MK");
    expect(authorInitials("vquinn")).toBe("V");
    expect(authorInitials("ada b. lovelace")).toBe("AB");
    expect(authorInitials(NO_AUTHOR_PLACEHOLDER)).toBe("");
    expect(authorInitials("")).toBe("");
  });
});

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats each window from the current clock", () => {
    expect(relativeTime("2026-09-15T11:59:30.000Z")).toBe("just now");
    expect(relativeTime("2026-09-15T11:45:00.000Z")).toBe("15m ago");
    expect(relativeTime("2026-09-15T09:00:00.000Z")).toBe("3h ago");
    expect(relativeTime("2026-09-13T12:00:00.000Z")).toBe("2d ago");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });
});

describe("toLedgerRow", () => {
  it("carries the real entity detail and type through without embellishment", () => {
    const row = toLedgerRow(
      entry({ kind: "synced", entityTypeLabel: "Power Plant", detail: "12,431 records", author: undefined }),
      new Date("2026-09-15T13:00:00.000Z").getTime()
    );
    expect(row.op).toBe("sync");
    expect(row.detail).toBe("12,431 records");
    expect(row.typeLabel).toBe("power plant");
    expect(row.time).toBe("1h ago");
    expect(row.author).toBe("commongrid-bot");
  });

  it("keys rows by slug and timestamp so repeated entity names do not collide", () => {
    const a = toLedgerRow(entry({ isoTimestamp: "2026-09-15T10:00:00.000Z" }));
    const b = toLedgerRow(entry({ isoTimestamp: "2026-09-15T11:00:00.000Z" }));
    expect(a.key).not.toBe(b.key);
  });
});

describe("formatLedgerCounters", () => {
  it("reports real totals for both windows", () => {
    expect(formatLedgerCounters({ day: 312, week: 2104 })).toBe("+312 changes in the last 24h · +2,104 this week");
  });

  it("says nothing happened rather than asserting activity", () => {
    expect(formatLedgerCounters({ day: 0, week: 0 })).toBe("No changes in the last 24h · none this week");
  });

  it("omits a window that has not resolved instead of guessing", () => {
    expect(formatLedgerCounters({ day: 5, week: null })).toBe("+5 changes in the last 24h");
    expect(formatLedgerCounters({ day: null, week: null })).toBeNull();
  });
});
