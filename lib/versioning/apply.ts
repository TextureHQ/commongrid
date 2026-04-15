/**
 * Version reconstruction — applies deltas to snapshots to rebuild any version state.
 */

import { DELETED_MARKER } from "./diff";

/**
 * Applies a single delta to a snapshot, returning the new state.
 * Fields marked with { __deleted: true } are removed from the result.
 */
export function applyDelta(
  snapshot: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...snapshot };

  for (const [key, value] of Object.entries(delta)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).__deleted === true
    ) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Applies multiple deltas in sequence to reconstruct a specific version.
 * Pass the base snapshot (version 1) and all subsequent deltas in order.
 */
export function reconstructVersion(
  snapshot: Record<string, unknown>,
  deltas: Record<string, unknown>[],
): Record<string, unknown> {
  return deltas.reduce(
    (state, delta) => applyDelta(state, delta),
    snapshot,
  );
}
