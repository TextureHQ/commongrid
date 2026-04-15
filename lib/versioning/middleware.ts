/**
 * Auto-versioning middleware — pure function that computes version data for insertion.
 * Does NOT touch the database; the caller is responsible for persisting the result.
 */

import { computeDelta } from "./diff";

export type ChangeSource = "api" | "sync" | "seed" | "manual";

export interface CreateVersionParams {
  entityType: string;
  entityId: string;
  /** Null for the first version; the previous state for subsequent versions. */
  previousData: Record<string, unknown> | null;
  currentData: Record<string, unknown>;
  changedBy: string;
  changeSource: ChangeSource;
  /**
   * The version number to assign. When previousData is null this should be 1.
   * The caller (DB layer) is responsible for supplying the correct next version number.
   */
  versionNumber: number;
}

export interface VersionData {
  versionNumber: number;
  /** Present only on version 1 — full JSONB snapshot. */
  snapshot?: Record<string, unknown>;
  /** Present on version 2+ — only the changed fields. */
  delta?: Record<string, unknown>;
}

/**
 * Computes the version data (snapshot or delta) to be inserted for a new version.
 *
 * - Version 1 (previousData is null): stores a full snapshot.
 * - Version 2+: stores only the delta (changed fields).
 * - Returns null when there are no changes between previousData and currentData.
 */
export function createVersion(params: CreateVersionParams): VersionData | null {
  const { previousData, currentData, versionNumber } = params;

  // First version — always store full snapshot
  if (previousData === null) {
    return {
      versionNumber,
      snapshot: currentData,
    };
  }

  // Subsequent versions — store only the delta
  const delta = computeDelta(previousData, currentData);
  if (delta === null) {
    // No changes detected
    return null;
  }

  return {
    versionNumber,
    delta,
  };
}
