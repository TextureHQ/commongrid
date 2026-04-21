/**
 * Detect the change type of a contribution.
 *
 * Uses the stored changeType column if available (new contributions);
 * falls back to entityVersion===0 for creates (legacy) and checks for
 * _deletion key in changes for deletes (legacy).
 *
 * IMPORTANT: entityVersion===0 check runs BEFORE the explicit "update" check
 * so that creates with a defaulted changeType ("update" or null) are still
 * correctly identified as creates. This prevents the review handler from
 * trying to fetch a non-existent entity (NOT_FOUND) when approving creates.
 */
export function detectChangeType(contribution: {
  changeType: string | null;
  entityVersion: number;
  changes: unknown;
}): "create" | "update" | "delete" {
  // Explicit create/delete always wins
  if (contribution.changeType === "create") return "create";
  if (contribution.changeType === "delete") return "delete";
  // Legacy/safety fallback: creates were submitted with entityVersion=0
  // Must run BEFORE the "update" check — a contribution with changeType
  // defaulted to "update" but entityVersion===0 is a create, not an update.
  if (contribution.entityVersion === 0) return "create";
  if (contribution.changeType === "update") return "update";
  // Legacy fallback: deletes have a _deletion key in changes
  const changes = contribution.changes as Record<string, unknown>;
  if (changes && typeof changes === "object" && "_deletion" in changes) return "delete";
  return "update";
}
