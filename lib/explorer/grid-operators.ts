/**
 * Shared helpers for grid operator rows (list panel) and grid operator
 * boundary features (map), so both describe an operator the same way.
 */

export type GridOperatorKind = "iso" | "rto" | "ba";

/**
 * Unique key for a grid operator: `${kind}:${slug}`. Slug alone is not
 * unique — several ISOs share a slug with their balancing authority
 * (e.g. `caiso`).
 */
export function gridOperatorKey(kind: GridOperatorKind, slug: string): string {
  return `${kind}:${slug}`;
}

/** "AZ, CA, NV" — or "IA, IL, IN +14" past three states. */
export function formatGridOperatorStates(states: string[]): string {
  const shown = states.slice(0, 3).join(", ");
  return states.length > 3 ? `${shown} +${states.length - 3}` : shown;
}
