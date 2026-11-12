import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { resolveEntityHref } from "@/lib/entity-href";
import { getEntityTable } from "./apply-contribution";

interface ContributionReference {
  entityType: string;
  entityId: string;
  entitySlug: string;
  changeType: string | null;
  changes: unknown;
}

export interface ContributionEntityContext {
  name: string;
  href: string | null;
  availability: "published" | "new" | "unavailable";
}

/** Resolve by stable ID, not a cached slug that may have changed since submission.
 * Batch by type so the queue needs at most one lookup per entity table.
 */
export async function addContributionContext<T extends ContributionReference>(rows: T[]) {
  const db = getDb();
  const entities = new Map<string, { name: string | null; slug: string | null; id: string }>();
  await Promise.all(
    [...new Set(rows.map((row) => row.entityType))].map(async (type) => {
      const table = getEntityTable(type);
      if (!table) return;
      const ids = rows.filter((row) => row.entityType === type).map((row) => row.entityId);
      const records = await db
        .select({ id: table.id, name: table.name ?? sql`NULL`, slug: table.slug ?? sql`NULL` })
        .from(table)
        .where(inArray(table.id, ids));
      for (const record of records) {
        entities.set(`${type}:${record.id}`, record as { id: string; name: string | null; slug: string | null });
      }
    })
  );
  return rows.map((row) => {
    const entity = entities.get(`${row.entityType}:${row.entityId}`);
    const changes = row.changes as { name?: { new?: unknown; old?: unknown } } | null;
    const proposedName = row.changeType === "create" ? changes?.name?.new : changes?.name?.old;
    const context: ContributionEntityContext = {
      name: entity?.name || (typeof proposedName === "string" ? proposedName : row.entitySlug || row.entityId),
      href: entity
        ? resolveEntityHref(row.entityType, row.entityType === "transmission_line" ? entity.id : entity.slug)
        : null,
      availability: entity ? "published" : row.changeType === "create" ? "new" : "unavailable",
    };
    return { ...row, entityContext: context };
  });
}
