/**
 * JSONB diff engine for delta-based versioning.
 * Computes shallow diffs between two records, representing deletions as { __deleted: true }.
 */

export const DELETED_MARKER = { __deleted: true } as const;

/**
 * Computes a delta between two records.
 * - Changed or added fields appear with their new values.
 * - Deleted fields appear as { __deleted: true }.
 * - Nested objects are diffed shallowly (full replacement, no deep recursion).
 * - Returns null if there are no changes.
 */
export function computeDelta(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> | null {
  const delta: Record<string, unknown> = {};

  // Check for changed/added fields in current
  for (const key of Object.keys(current)) {
    const prevVal = previous[key];
    const currVal = current[key];

    if (!isEqual(prevVal, currVal)) {
      delta[key] = currVal;
    }
  }

  // Check for deleted fields
  for (const key of Object.keys(previous)) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      delta[key] = DELETED_MARKER;
    }
  }

  return Object.keys(delta).length > 0 ? delta : null;
}

/**
 * Shallow equality check that handles primitives, null, arrays, and plain objects.
 * Arrays and nested objects are compared by JSON serialization (shallow diff behavior).
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  // Arrays: compare by serialization
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  // Objects: shallow comparison via serialization (full replacement at nested level)
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}
