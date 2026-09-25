/**
 * applySync — the single write path for scheduled data syncs.
 *
 * This is the automation twin of `applyContribution` (lib/mod/apply-contribution.ts).
 * A community edit and an EIA-860M sync must land in the database identically:
 * the entity row and its `entity_versions` row are written together in one
 * transaction, so a change is always reconstructable and shows up in the
 * changelog.
 *
 * The differences from the contribution path are deliberate:
 *
 *  - Bulk, not one-at-a-time. A sync compares an upstream dataset against the
 *    entire current table and emits many creates/updates in one run, grouped
 *    under a single `change_batches` row so the changelog reads
 *    "EIA-860M sync · 1,204 records" rather than 1,204 separate lines.
 *
 *  - Idempotent by construction. Diffing against current DB state means a
 *    re-run with unchanged upstream data produces an empty delta for every
 *    record, writes zero version rows, and adds nothing to the changelog.
 *
 *  - Conflict policy (B) — human edits are sticky. Before overwriting a field,
 *    the writer checks per-field provenance (see field-provenance.ts). Any
 *    field whose most recent version was authored by a human
 *    (community/admin/community_override) is left untouched and recorded as a
 *    deferral in the run report. A sync is authoritative for machine-owned
 *    data, never for a deliberate human correction.
 *
 *  - No moderation queue. EIA/HIFLD/AFDC/ISO feeds are the authoritative
 *    upstream sources; routing thousands of official records through human
 *    review would bury genuine community contributions. Syncs are authoritative
 *    writers, not petitioners — exactly as `change_batches` was designed for
 *    ("a sync run writes versions with no contribution behind them").
 *
 * Every sync record MUST provide a stable natural id (`entityId`) so re-runs
 * update the same row rather than duplicating it. Callers own the mapping from
 * an upstream key (EIA plant code, AFDC station id, …) to that id.
 */

import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { getPooledDb } from "@/lib/db/client-pooled";
import { changeBatches, entityVersions } from "@/lib/db/schema";
import { buildVersionRecord, computeDelta, generateChangeSummary } from "@/lib/db/versioning";
import {
  type DbTransaction,
  type EntityType,
  getEntityTable,
  isKnownEntityType,
  toVersionableSnapshot,
} from "@/lib/mod/apply-contribution";
import { getHumanLockedFields } from "./field-provenance";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One upstream record a sync wants to assert into the registry. */
export interface SyncRecord {
  /** Registered upstream source, independent of the machine actor. */
  sourceId: string;
  /** Upstream observation date; explicitly null when unknown (never ingest time). */
  asOf: Date | null;
  /**
   * Stable primary-key value for the entity row. Re-runs must produce the same
   * id for the same upstream record, or the sync will create duplicates instead
   * of updating in place.
   */
  entityId: string;
  /** Slug to set on create (tables that have a slug column). */
  slug?: string;
  /**
   * Desired field values in Drizzle (camelCase) shape. Only content fields;
   * bookkeeping columns (id/version/createdAt/updatedAt) are managed here.
   */
  fields: Record<string, unknown>;
}

export interface ApplySyncOptions {
  entityType: EntityType;
  /** Machine actor recorded on every version, e.g. "sync:eia-860m". */
  initiatedBy: string;
  /** Human-facing batch title, e.g. "EIA-860M monthly sync". */
  batchTitle: string;
  batchDescription?: string;
  /**
   * When true, records present in the DB but absent from `records` are NOT
   * touched. Syncs are usually partial (860M only ships changed generators), so
   * the default is to never infer deletions from absence. A full-replacement
   * sync can opt into soft-deletes later; that is intentionally out of scope
   * here.
   */
  deleteAbsent?: boolean;
  now?: Date;
}

/** A field a sync wanted to change but skipped because a human owns it. */
export interface FieldDeferral {
  entityId: string;
  field: string;
  /** Value currently in the DB (the human-authored value, preserved). */
  keptValue: unknown;
  /** Value the sync would have written. */
  skippedValue: unknown;
}

export interface ApplySyncReport {
  batchId: string | null;
  entityType: EntityType;
  created: number;
  updated: number;
  /** Records whose desired state already matched the DB (no version written). */
  unchanged: number;
  /** Per-field deferrals under policy (B). */
  deferrals: FieldDeferral[];
  /** Total field writes actually applied across all updated records. */
  fieldsWritten: number;
}

// ---------------------------------------------------------------------------
// applySync
// ---------------------------------------------------------------------------

/**
 * Apply a batch of upstream records to the registry.
 *
 * Runs in a single transaction: the batch row, every entity write, and every
 * `entity_versions` row commit together or not at all. A partial apply would
 * leave an unversioned change history can never account for.
 */
export async function applySync(records: SyncRecord[], opts: ApplySyncOptions): Promise<ApplySyncReport> {
  if (!isKnownEntityType(opts.entityType)) {
    throw new Error(`Unknown entity type: ${opts.entityType}`);
  }
  const table = getEntityTable(opts.entityType);
  if (!table) throw new Error(`No table for entity type: ${opts.entityType}`);

  // Validate before opening a transaction, including calls from untyped scripts.
  for (const record of records) {
    if (typeof record.sourceId !== "string" || !record.sourceId.trim()) {
      throw new Error(`Missing sourceId for ${record.entityId}`);
    }
    if (record.asOf !== null && (!(record.asOf instanceof Date) || !Number.isFinite(record.asOf.getTime()))) {
      throw new Error(`Invalid or missing asOf for ${record.entityId}; use null for unknown vintage`);
    }
  }

  const now = opts.now ?? new Date();
  const db = getPooledDb();

  const report: ApplySyncReport = {
    batchId: null,
    entityType: opts.entityType,
    created: 0,
    updated: 0,
    unchanged: 0,
    deferrals: [],
    fieldsWritten: 0,
  };

  await db.transaction(async (tx) => {
    // Open the batch first so every version can reference it. We keep the row
    // even if nothing changes — an empty batch is a truthful record that the
    // sync ran and found no updates, and the changelog feed already excludes
    // batches with zero non-baseline versions from the feed.
    const [batch] = await tx
      .insert(changeBatches)
      .values({
        sourceType: "sync",
        title: opts.batchTitle,
        description: opts.batchDescription ?? null,
        initiatedBy: opts.initiatedBy,
        startedAt: now,
      })
      .returning({ id: changeBatches.id });
    report.batchId = batch.id;

    let versionCount = 0;

    for (const record of records) {
      const outcome = await applyOneRecord(tx, {
        table,
        entityType: opts.entityType,
        record,
        initiatedBy: opts.initiatedBy,
        batchId: batch.id,
        now,
      });

      if (outcome.kind === "created") {
        report.created += 1;
        versionCount += 1;
        report.fieldsWritten += outcome.fieldsWritten;
      } else if (outcome.kind === "updated") {
        report.updated += 1;
        versionCount += 1;
        report.fieldsWritten += outcome.fieldsWritten;
      } else {
        report.unchanged += 1;
      }
      report.deferrals.push(...outcome.deferrals);
    }

    // Maintained by writers so the feed never counts versions to size a batch.
    await tx.update(changeBatches).set({ versionCount, completedAt: new Date() }).where(eq(changeBatches.id, batch.id));
  });

  return report;
}

// ---------------------------------------------------------------------------
// Per-record apply
// ---------------------------------------------------------------------------

type RecordOutcome =
  | { kind: "created"; fieldsWritten: number; deferrals: FieldDeferral[] }
  | { kind: "updated"; fieldsWritten: number; deferrals: FieldDeferral[] }
  | { kind: "unchanged"; deferrals: FieldDeferral[] };

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types vary per table.
type AnyTable = any;

async function applyOneRecord(
  tx: DbTransaction,
  args: {
    table: AnyTable;
    entityType: EntityType;
    record: SyncRecord;
    initiatedBy: string;
    batchId: string;
    now: Date;
  }
): Promise<RecordOutcome> {
  const { table, entityType, record, initiatedBy, batchId, now } = args;

  // Lock the row (if it exists) so a concurrent contribution approval cannot
  // interleave between our read and write. Same guarantee applyContribution
  // relies on.
  await tx.execute(
    sql`SELECT id FROM ${sql.identifier(tableName(entityType))} WHERE id = ${record.entityId} FOR UPDATE`
  );

  const [existing] = await tx.select().from(table).where(eq(table.id, record.entityId)).limit(1);

  // --- create ---------------------------------------------------------------
  if (!existing) {
    const insertValues: Record<string, unknown> = {
      id: record.entityId,
      createdAt: now,
      updatedAt: now,
    };
    if (columnExists(table, "slug") && record.slug) insertValues.slug = record.slug;
    if (columnExists(table, "version")) insertValues.version = 1;
    for (const [field, value] of Object.entries(record.fields)) {
      if (columnExists(table, field)) insertValues[field] = value;
    }

    await tx.insert(table).values(insertValues);

    const versioned = toVersionableSnapshot(insertValues, table);
    const rec = buildVersionRecord(
      entityType,
      record.entityId,
      1,
      versioned,
      null,
      "create",
      initiatedBy,
      `Added via ${initiatedBy}`
    );
    await tx.insert(entityVersions).values({
      ...rec,
      changedAt: now,
      sourceType: "sync",
      sourceId: record.sourceId,
      asOf: record.asOf,
      batchId,
    });

    return { kind: "created", fieldsWritten: Object.keys(versioned).length, deferrals: [] };
  }

  // --- update ---------------------------------------------------------------
  const before = toVersionableSnapshot(existing as Record<string, unknown>, table);

  // Policy (B): never overwrite a field a human most-recently authored.
  const locked = await getHumanLockedFields(tx, entityType, record.entityId);

  const deferrals: FieldDeferral[] = [];
  const applied: Record<string, unknown> = {};

  for (const [field, desired] of Object.entries(record.fields)) {
    if (!columnExists(table, field)) continue;
    const current = (existing as Record<string, unknown>)[field];

    // No change requested — skip silently, this is the idempotent path.
    if (jsonEqual(current, desired)) continue;

    if (locked.has(field)) {
      deferrals.push({ entityId: record.entityId, field, keptValue: current, skippedValue: desired });
      continue;
    }
    applied[field] = desired;
  }

  // Nothing to write (everything matched or was deferred): no version row.
  if (Object.keys(applied).length === 0) {
    return { kind: "unchanged", deferrals };
  }

  const currentVersion: number = (existing as { version?: number }).version ?? 0;
  const baselineVersion = await ensureBaseline(tx, entityType, record.entityId, before, table, currentVersion);
  const newVersion = Math.max(currentVersion, baselineVersion) + 1;

  const entityUpdates: Record<string, unknown> = { ...applied, updatedAt: now };
  if (columnExists(table, "version")) entityUpdates.version = newVersion;

  await tx.update(table).set(entityUpdates).where(eq(table.id, record.entityId));

  const after = { ...before, ...applied };
  const delta = computeDelta(before, after);
  const rec = buildVersionRecord(
    entityType,
    record.entityId,
    newVersion,
    after,
    before,
    "update",
    initiatedBy,
    generateChangeSummary(delta)
  );
  await tx.insert(entityVersions).values({
    ...rec,
    changedAt: now,
    sourceType: "sync",
    sourceId: record.sourceId,
    asOf: record.asOf,
    batchId,
  });

  return { kind: "updated", fieldsWritten: Object.keys(applied).length, deferrals };
}

// ---------------------------------------------------------------------------
// Baseline (mirror of apply-contribution.ensureBaselineVersion)
// ---------------------------------------------------------------------------

/**
 * Guarantee a snapshot exists before the first delta is written for an entity.
 * Without a v1 snapshot, `reconstructEntityAtVersion` can never rebuild history.
 * Numbered with the entity's current version, not 1: an entity already at v5 has
 * had five states, and recording its present state as "version 1" would corrupt
 * every later reconstruction. Idempotent on the (type,id,version) unique index.
 */
async function ensureBaseline(
  tx: DbTransaction,
  entityType: string,
  entityId: string,
  currentState: Record<string, unknown>,
  table: AnyTable,
  currentVersion: number
): Promise<number> {
  const [existing] = await tx
    .select({ maxVersion: sql<number | null>`max(${entityVersions.versionNumber})` })
    .from(entityVersions)
    .where(sql`${entityVersions.entityType} = ${entityType} and ${entityVersions.entityId} = ${entityId}`);

  const highest = existing?.maxVersion != null ? Number(existing.maxVersion) : null;
  if (highest !== null) return highest;

  const baselineNumber = Math.max(currentVersion, 1);
  const snapshot = toVersionableSnapshot(currentState, table);
  await tx
    .insert(entityVersions)
    .values({
      entityType,
      entityId,
      versionNumber: baselineNumber,
      snapshot,
      delta: null,
      changedBy: "system",
      changeType: "create",
      changeSummary: "Initial recorded state",
      sourceType: "sync",
      changedAt: new Date(0), // baseline predates any real change
      ...labelFrom(snapshot),
    })
    .onConflictDoNothing();

  return baselineNumber;
}

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

const ENTITY_TABLE_NAMES: Record<EntityType, string> = {
  utility: "utilities",
  power_plant: "power_plants",
  ev_station: "ev_stations",
  territory: "territories",
  transmission_line: "transmission_lines",
  pricing_node: "pricing_nodes",
  iso: "isos",
  rto: "rtos",
  balancing_authority: "balancing_authorities",
  region: "regions",
  program: "programs",
<<<<<<< HEAD
  rate_structure: "rate_structures",
=======
  tariff: "tariffs",
>>>>>>> 57849bd (feat(data): add attributed, versioned URDB tariff sync (CG-307))
};

function tableName(entityType: EntityType): string {
  return ENTITY_TABLE_NAMES[entityType];
}

function columnExists(table: AnyTable, prop: string): boolean {
  return table[prop] !== undefined;
}

function labelFrom(row: Record<string, unknown>): { entityName: string | null; entitySlug: string | null } {
  const name = row.name ?? row.stationName ?? row.title ?? null;
  return {
    entityName: typeof name === "string" ? name : null,
    entitySlug: typeof row.slug === "string" ? row.slug : null,
  };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  // PostgreSQL JSONB reorders object keys. Key order is not a data change.
  return isDeepStrictEqual(a, b);
}
