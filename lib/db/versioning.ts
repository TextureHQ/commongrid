/**
 * Delta-based version history system.
 *
 * Version 1: full JSONB snapshot of the entity
 * Version 2+: delta only ({ field: { old, new } })
 * ~75x storage reduction vs full snapshots
 *
 * Spec ref: Section 3.6
 */

/**
 * Compute the delta between two entity states.
 * Returns only the fields that changed.
 */
export function computeDelta(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const delta: Record<string, { old: unknown; new: unknown }> = {};

  // Check all keys in both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldVal = oldData[key];
    const newVal = newData[key];

    // Skip internal fields
    if (key === "createdAt" || key === "updatedAt" || key === "version" || key === "searchVector") {
      continue;
    }

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      delta[key] = { old: oldVal, new: newVal };
    }
  }

  return delta;
}

/**
 * Generate a human-readable summary of changes.
 */
export function generateChangeSummary(delta: Record<string, { old: unknown; new: unknown }>): string {
  const fields = Object.keys(delta);

  if (fields.length === 0) return "No changes";

  if (fields.length <= 3) {
    return fields
      .map((f) => {
        const oldStr = JSON.stringify(delta[f].old);
        const newStr = JSON.stringify(delta[f].new);
        // Truncate long values
        const truncate = (s: string) => (s.length > 50 ? `${s.slice(0, 47)}...` : s);
        return `${f}: ${truncate(oldStr)} → ${truncate(newStr)}`;
      })
      .join(", ");
  }

  return `Updated ${fields.length} fields: ${fields.join(", ")}`;
}

/**
 * Human label for a changelog entry, whichever property the table uses. Most
 * have `name`, ev_stations has `stationName`, territories and
 * transmission_lines have none.
 *
 * Denormalized onto entity_versions because (entity_type, entity_id) is
 * polymorphic with no foreign key — rendering a feed row otherwise means a join
 * across whichever of eleven entity tables the pair points at, per row.
 *
 * Expects a Drizzle-shaped row (camelCase). The backfill imports this rather
 * than reimplementing it, so live-written and backfilled rows agree.
 */
export function entityLabel(row: Record<string, unknown> | null): {
  entityName: string | null;
  entitySlug: string | null;
} {
  if (!row) return { entityName: null, entitySlug: null };
  const name = row.name ?? row.stationName ?? row.title ?? null;
  return {
    entityName: typeof name === "string" ? name : null,
    entitySlug: typeof row.slug === "string" ? row.slug : null,
  };
}

/**
 * Build a version record for insertion.
 * Returns the data to insert into entity_versions table.
 */
export function buildVersionRecord(
  entityType: string,
  entityId: string,
  versionNumber: number,
  newData: Record<string, unknown>,
  oldData: Record<string, unknown> | null,
  changeType: "create" | "update" | "delete",
  changedBy: string,
  changeSummary?: string
): {
  entityType: string;
  entityId: string;
  versionNumber: number;
  snapshot: Record<string, unknown> | null;
  delta: Record<string, { old: unknown; new: unknown }> | null;
  changedBy: string;
  changeType: string;
  changeSummary: string;
  entityName: string | null;
  entitySlug: string | null;
} {
  if (versionNumber === 1) {
    // First version: store full snapshot
    return {
      entityType,
      entityId,
      versionNumber: 1,
      snapshot: newData,
      delta: null,
      changedBy,
      changeType,
      changeSummary: changeSummary || "Initial creation",
      ...entityLabel(newData),
    };
  }

  // Subsequent versions: store delta only
  if (!oldData) throw new Error("oldData is required for version > 1");
  const delta = computeDelta(oldData, newData);

  return {
    entityType,
    entityId,
    versionNumber,
    snapshot: null,
    delta,
    changedBy,
    changeType,
    changeSummary: changeSummary || generateChangeSummary(delta),
    // From newData, so the label reflects the entity as of this version — a
    // rename shows the new name on the version that renamed it.
    ...entityLabel(newData),
  };
}

/**
 * Reconstruct an entity at a specific version by applying deltas to the base snapshot.
 */
export function reconstructEntityAtVersion(
  versions: Array<{
    versionNumber: number;
    snapshot: Record<string, unknown> | null;
    delta: Record<string, { old: unknown; new: unknown }> | null;
  }>,
  targetVersion: number
): Record<string, unknown> | null {
  if (versions.length === 0) return null;

  // Sort by version number
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);

  // First version must have a snapshot
  const base = sorted[0];
  if (!base.snapshot) {
    throw new Error(`Version 1 for entity must have a snapshot, but none found`);
  }

  // Start with base snapshot
  const entity = { ...base.snapshot };

  // Apply deltas up to target version
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].versionNumber > targetVersion) break;

    const delta = sorted[i].delta;
    if (delta) {
      for (const [key, change] of Object.entries(delta)) {
        entity[key] = change.new;
      }
    }
  }

  return entity;
}
