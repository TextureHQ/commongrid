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
  /**
   * Present only on collapsed batch rows (a sync run). The UI uses it to fetch
   * the per-item breakout from `/api/v1/changelog/batches/:batchId`.
   */
  batchId?: string;
  /** Number of records the batch touched; shown on the collapsed row. */
  itemCount?: number;
}

/** One row in a batch breakout — the per-item detail behind a collapsed sync row. */
export interface ChangelogBatchItem {
  versionId: number;
  entityType: string;
  entityId: string;
  entityName: string | null;
  entitySlug: string | null;
  changeType: string;
  changeSummary: string | null;
  changedAt: string;
  href: string | null;
}

export interface Changelog {
  updatedAt: string;
  recentlyUpdated: ChangelogEntry[];
  newlyAdded: ChangelogEntry[];
}
