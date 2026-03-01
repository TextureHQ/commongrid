export type EntityKind = "utility" | "iso" | "rto" | "balancing-authority";

export interface ChangelogEntry {
  kind: "updated" | "added";
  entityType: EntityKind;
  entityTypeLabel: string;
  name: string;
  slug: string;
  detail: string;
  isoTimestamp: string;
}

export interface Changelog {
  updatedAt: string;
  recentlyUpdated: ChangelogEntry[];
  newlyAdded: ChangelogEntry[];
}
