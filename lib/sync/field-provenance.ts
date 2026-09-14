/**
 * Per-field provenance — the mechanism behind sync conflict policy (B).
 *
 * Policy (B): an automated sync must never silently overwrite a field a human
 * deliberately corrected. To honour that we need to know, for each field on an
 * entity, whether the *most recent* change to that specific field came from a
 * human (`community`, `admin`, `community_override`) or from a machine
 * (`sync`, `merge`, or the initial baseline).
 *
 * entity_versions stores this implicitly:
 *   - v1 is a full snapshot (every field "set" by whatever source wrote v1).
 *   - v2+ store a delta `{ field: { old, new } }` plus that version's
 *     `source_type`.
 *
 * So the latest human-authored value of a field is the highest-numbered version
 * whose delta (or snapshot, for v1) contains that field key AND whose
 * source_type is human. If a later machine version also touched the field, the
 * machine value is current and the field is no longer "human-locked" — a human
 * would have to re-assert it. We therefore walk versions newest-first and, for
 * each field, record the source of the first (newest) version that touched it.
 *
 * A field is "locked" when that newest-touching source is human.
 */

import { and, desc, eq } from "drizzle-orm";
import type { getPooledDb } from "@/lib/db/client-pooled";
import { entityVersions } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/mod/apply-contribution";

/** Version source types authored by a human decision, not a machine sync. */
export const HUMAN_SOURCE_TYPES: ReadonlySet<string> = new Set(["community", "admin", "community_override"]);

type Reader = Pick<DbTransaction, "select"> | ReturnType<typeof getPooledDb>;

interface VersionRow {
  versionNumber: number;
  snapshot: unknown;
  delta: unknown;
  sourceType: string | null;
}

/**
 * Fields that a human set more recently than any machine did.
 *
 * Returns camelCase field names (the shape stored in deltas/snapshots), so
 * callers comparing against Drizzle row properties need no conversion.
 *
 * The read is intentionally driver-agnostic: the sync apply path calls this
 * inside its transaction (passing `tx`), but tests and diagnostics can pass the
 * pooled client directly.
 */
export async function getHumanLockedFields(reader: Reader, entityType: string, entityId: string): Promise<Set<string>> {
  const rows = (await reader
    .select({
      versionNumber: entityVersions.versionNumber,
      snapshot: entityVersions.snapshot,
      delta: entityVersions.delta,
      sourceType: entityVersions.sourceType,
    })
    .from(entityVersions)
    .where(and(eq(entityVersions.entityType, entityType), eq(entityVersions.entityId, entityId)))
    .orderBy(desc(entityVersions.versionNumber))) as VersionRow[];

  const locked = new Set<string>();
  // Fields already resolved to their newest-touching source. Once a field's
  // newest version is seen (walking newest-first), older versions cannot change
  // the verdict, so we stop reconsidering it.
  const resolved = new Set<string>();

  for (const row of rows) {
    const isHuman = row.sourceType != null && HUMAN_SOURCE_TYPES.has(row.sourceType);
    const touched = fieldsTouchedBy(row);

    for (const field of touched) {
      if (resolved.has(field)) continue;
      resolved.add(field);
      if (isHuman) locked.add(field);
    }
  }

  return locked;
}

/**
 * Field keys a single version asserts a value for: delta keys for a delta row,
 * every content key for a v1 snapshot. Bookkeeping keys are ignored so a sync
 * is never blocked from writing `updatedAt`/`version`.
 */
function fieldsTouchedBy(row: VersionRow): string[] {
  const source = row.delta ?? row.snapshot;
  if (!source || typeof source !== "object") return [];
  return Object.keys(source as Record<string, unknown>).filter((key) => !IGNORED_FIELDS.has(key));
}

const IGNORED_FIELDS: ReadonlySet<string> = new Set(["createdAt", "updatedAt", "version", "searchVector"]);
