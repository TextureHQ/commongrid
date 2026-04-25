export type EntityKind = "utility" | "iso" | "rto" | "balancing-authority";

export type ChangelogOperation = "updated" | "added" | "corrected" | "synced";

export interface ChangelogEntry {
  kind: ChangelogOperation;
  entityType: EntityKind;
  entityTypeLabel: string;
  name: string;
  slug: string;
  detail: string;
  isoTimestamp: string;
  source?: string;
  author?: string;
}

export interface Changelog {
  updatedAt: string;
  recentlyUpdated: ChangelogEntry[];
  newlyAdded: ChangelogEntry[];
}
