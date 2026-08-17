/**
 * Write a baseline `entity_versions` row for every entity that has none.
 *
 * `entity_versions` is empty, so no entity has recoverable history and the
 * changelog has nothing to render. Worse, `reconstructEntityAtVersion` throws
 * when the earliest version carries no snapshot, so any delta written against
 * an entity with no baseline is permanently unreconstructable.
 *
 * Grouped under one `change_batches` row so the changelog shows a single
 * "baseline snapshot" entry rather than 166k of them.
 *
 * Idempotent and resumable: rows conflict on
 * (entity_type, entity_id, version_number) and are skipped, so a re-run after
 * an interruption continues where it stopped.
 *
 *   npm run db:backfill:versions                    # dry run, counts only
 *   npm run db:backfill:versions -- --apply         # write
 *   npm run db:backfill:versions -- --apply --only utility
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { changeBatches, entityVersions } from "@/lib/db/schema";
import { getEntityTable, toVersionableSnapshot } from "@/lib/mod/apply-contribution";

/**
 * Baseline rows are not creations. The entity already existed; this records the
 * state it was already in. Labelling it 'create' would claim every entity in
 * the catalogue was created the day the backfill ran.
 */
const BASELINE_CHANGE_TYPE = "baseline";

const BATCH_SIZE = 1000;

/** entity_type -> physical table, smallest first so problems surface cheaply. */
const TYPES: Array<{ entityType: string; table: string }> = [
  { entityType: "iso", table: "isos" },
  { entityType: "rto", table: "rtos" },
  { entityType: "balancing_authority", table: "balancing_authorities" },
  { entityType: "program", table: "programs" },
  { entityType: "territory", table: "territories" },
  { entityType: "region", table: "regions" },
  { entityType: "utility", table: "utilities" },
  { entityType: "pricing_node", table: "pricing_nodes" },
  { entityType: "power_plant", table: "power_plants" },
  { entityType: "transmission_line", table: "transmission_lines" },
  { entityType: "ev_station", table: "ev_stations" },
];

/**
 * Which column holds the human label, in preference order. The tables disagree:
 * most use `name`, ev_stations uses `station_name`, and territories and
 * transmission_lines have none at all. Resolved per table at runtime rather
 * than hardcoded — a hardcoded list is what hid ev_stations' shape, and it is
 * the largest type by half.
 */
const NAME_COLUMNS = ["name", "station_name", "title"];

async function resolveLabelColumns(db: Db, table: string): Promise<{ name: string | null; slug: string | null }> {
  const { rows } = await db.execute(sql`
    select column_name from information_schema.columns where table_name = ${table}
  `);
  const present = new Set(rows.map((r) => (r as { column_name: string }).column_name));
  return {
    name: NAME_COLUMNS.find((c) => present.has(c)) ?? null,
    slug: present.has("slug") ? "slug" : null,
  };
}

type Db = ReturnType<typeof drizzle>;

/**
 * Drizzle silently drops keys that do not match a column, so running this
 * against a database without migration 0021 would write 166k rows with no
 * batch_id and no denormalized name — succeeding, and leaving a mess that looks
 * like success. Fail before writing anything.
 */
async function assertSchemaReady(db: Db): Promise<void> {
  const { rows } = await db.execute(sql`
    select
      to_regclass('public.change_batches') is not null as has_batches,
      count(*) filter (where column_name in ('batch_id','entity_name','entity_slug')) as new_cols
    from information_schema.columns
    where table_name = 'entity_versions'
  `);
  const row = rows[0] as { has_batches: boolean; new_cols: string };

  const missing: string[] = [];
  if (!row.has_batches) missing.push("change_batches table");
  if (Number(row.new_cols) < 3) {
    missing.push(`entity_versions.batch_id/entity_name/entity_slug (found ${row.new_cols}/3)`);
  }
  if (missing.length > 0) {
    console.error("\nSCHEMA NOT READY — migration 0021 has not been applied here.\n");
    for (const m of missing) console.error(`  missing: ${m}`);
    console.error("\nRun `npm run db:migrate` first.\n");
    process.exit(1);
  }
}

/** Entities with no version row yet, paged by primary key. */
async function* pendingRows(
  db: Db,
  entityType: string,
  table: string,
  labels: { name: string | null; slug: string | null }
) {
  let after = "";
  for (;;) {
    const nameCol = sql.raw(labels.name ? `e.${labels.name}` : "null");
    const slugCol = sql.raw(labels.slug ? `e.${labels.slug}` : "null");
    const { rows } = await db.execute(sql`
      select e.id, e.version, ${nameCol} as entity_name, ${slugCol} as entity_slug, to_jsonb(e) as full_row
      from ${sql.raw(table)} e
      where e.deleted_at is null
        and e.id > ${after}
        and not exists (
          select 1 from entity_versions v
          where v.entity_type = ${entityType} and v.entity_id = e.id
        )
      order by e.id
      limit ${BATCH_SIZE}
    `);
    if (rows.length === 0) return;
    yield rows as Array<{
      id: string;
      version: number;
      entity_name: string | null;
      entity_slug: string | null;
      full_row: Record<string, unknown>;
    }>;
    after = (rows[rows.length - 1] as { id: string }).id;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const db = drizzle(client);

  try {
    await assertSchemaReady(db);

    const host = (() => {
      try {
        return new URL(databaseUrl).hostname;
      } catch {
        return "?";
      }
    })();
    console.log(`database : ${host}`);
    console.log(`mode     : ${apply ? "APPLY" : "dry run"}${only ? `  (only ${only})` : ""}\n`);

    const targets = only ? TYPES.filter((t) => t.entityType === only) : TYPES;
    if (targets.length === 0) {
      console.error(`Unknown entity type '${only}'. Known: ${TYPES.map((t) => t.entityType).join(", ")}`);
      process.exit(1);
    }

    let batchId: string | null = null;
    if (apply) {
      const [batch] = await db
        .insert(changeBatches)
        .values({
          sourceType: "backfill",
          title: "Baseline entity snapshots",
          description: "One v1 snapshot per entity, so version history has a reconstructable starting point.",
          initiatedBy: "scripts/backfill-entity-versions.ts",
        })
        .returning();
      batchId = batch.id;
      console.log(`batch    : ${batchId}\n`);
    }

    let grandTotal = 0;
    for (const target of targets) {
      const table = getEntityTable(target.entityType);
      if (!table) {
        console.error(`  ${target.entityType}: not in ENTITY_TABLES, skipping`);
        continue;
      }

      const labels = await resolveLabelColumns(db, target.table);
      if (!labels.name) {
        console.log(`  ${target.entityType.padEnd(20)} (no label column — entity_name stays null)`);
      }

      let written = 0;
      for await (const page of pendingRows(db, target.entityType, target.table, labels)) {
        if (!apply) {
          written += page.length;
          continue;
        }

        const values = page.map((row) => ({
          entityType: target.entityType,
          entityId: row.id,
          // The entity's CURRENT version, not 1. An entity already at v5 has had
          // five states; calling its present state "version 1" would make every
          // later reconstruction report the wrong history.
          versionNumber: row.version ?? 1,
          snapshot: toVersionableSnapshot(row.full_row, table),
          changeType: BASELINE_CHANGE_TYPE,
          sourceType: "backfill",
          batchId,
          entityName: row.entity_name,
          entitySlug: row.entity_slug,
        }));

        await db.insert(entityVersions).values(values).onConflictDoNothing();
        written += values.length;
        if (written % 10000 === 0) console.log(`  ${target.entityType}: ${written}…`);
      }

      grandTotal += written;
      console.log(`  ${target.entityType.padEnd(20)} ${written.toLocaleString().padStart(8)}`);
    }

    console.log(`\n${apply ? "Wrote" : "Would write"} ${grandTotal.toLocaleString()} baseline version(s).`);

    if (apply && batchId) {
      if (grandTotal === 0) {
        // A re-run over an already-backfilled database writes nothing. Leaving
        // the batch behind would put an empty entry in the changelog for every
        // no-op run.
        await db.delete(changeBatches).where(sql`${changeBatches.id} = ${batchId}`);
        console.log("Nothing to do; batch discarded.");
      } else {
        await db
          .update(changeBatches)
          .set({ versionCount: grandTotal, completedAt: new Date() })
          .where(sql`${changeBatches.id} = ${batchId}`);
      }
    } else if (!apply) {
      console.log("Dry run. Re-run with --apply to write.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
