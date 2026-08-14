/**
 * applyContribution — the single write path for accepted contributions.
 *
 * Both the moderator approve route and the auto-approval path funnel through
 * here, so an accepted edit is applied and versioned identically no matter who
 * (or what) accepted it.
 *
 * Before this existed, `lib/mod/auto-approve.ts` marked contributions
 * `auto_approved` and incremented the contributor's stats without ever writing
 * to the entity table or `entity_versions` — accepted edits were silently
 * discarded. See the PR that introduced this file for the confirmed instance.
 *
 * Callers MUST invoke this inside a transaction (see `getPooledDb()` — the
 * neon-http client used elsewhere cannot do transactions). The entity write and
 * its `entity_versions` row must land together or not at all; a partial apply
 * leaves an unversioned change that reconstruction can never account for.
 *
 * Returns an outcome rather than throwing on conflicts, because the two callers
 * want different behaviour: a moderator gets a 409 and a `version_conflict`
 * record, while auto-approval simply declines and leaves the contribution
 * pending for a human.
 */

import { and, eq, sql } from "drizzle-orm";
import type { getPooledDb } from "@/lib/db/client-pooled";
import {
  balancingAuthorities,
  contributions,
  entityVersions,
  evStations,
  isos,
  powerPlants,
  pricingNodes,
  programs,
  regions,
  rtos,
  territories,
  transmissionLines,
  utilities,
} from "@/lib/db/schema";
import { buildVersionRecord } from "@/lib/db/versioning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The transaction handle produced by `getPooledDb().transaction(...)`. */
export type DbTransaction = Parameters<Parameters<ReturnType<typeof getPooledDb>["transaction"]>[0]>[0];

export type EntityType =
  | "utility"
  | "power_plant"
  | "ev_station"
  | "territory"
  | "transmission_line"
  | "pricing_node"
  | "iso"
  | "rto"
  | "balancing_authority"
  | "region"
  | "program";

export type ChangeType = "create" | "update" | "delete";

/** Where an accepted change came from, recorded on the version row. */
export type VersionSourceType = "community" | "admin";

export type ApplyOutcome =
  | { status: "applied"; appliedVersion: number; changeType: ChangeType }
  | { status: "version_conflict"; entityVersion: number; contributionVersion: number }
  | { status: "entity_missing" }
  | { status: "unknown_fields"; fields: string[] };

/** The subset of a contribution this module needs. */
export interface ApplicableContribution {
  id: string;
  entityType: string;
  entityId: string;
  entitySlug: string | null;
  entityVersion: number;
  changes: unknown;
  editSummary: string;
  changeType: string | null;
  userId: string | null;
}

// ---------------------------------------------------------------------------
// Entity table registry
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types vary per table; a union would be unusable here.
type AnyTable = any;

const ENTITY_TABLES: Record<EntityType, AnyTable> = {
  utility: utilities,
  power_plant: powerPlants,
  ev_station: evStations,
  territory: territories,
  transmission_line: transmissionLines,
  pricing_node: pricingNodes,
  iso: isos,
  rto: rtos,
  balancing_authority: balancingAuthorities,
  region: regions,
  program: programs,
};

export function getEntityTable(entityType: string): AnyTable | null {
  return ENTITY_TABLES[entityType as EntityType] ?? null;
}

export function isKnownEntityType(entityType: string): entityType is EntityType {
  return entityType in ENTITY_TABLES;
}

/** Physical table name, for the raw FOR UPDATE lock. */
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `customer_count` -> `customerCount`. Field names cross a naming boundary. */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function tableHasColumn(table: AnyTable, columnProp: string): boolean {
  return table[columnProp] !== undefined;
}

/**
 * Normalize `changes` to `{ field: { old, new } }`.
 *
 * Two shapes are in circulation: the canonical one, and a flat
 * `{ field: value }` that EditEntityPanel can send. Collapsing these to a
 * single contract is tracked separately; until then both callers need to
 * tolerate either.
 */
export function normalizeChanges(changes: unknown): Record<string, { old: unknown; new: unknown }> {
  const result: Record<string, { old: unknown; new: unknown }> = {};
  if (!changes || typeof changes !== "object") return result;

  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && "new" in (value as object)) {
      result[key] = value as { old: unknown; new: unknown };
    } else {
      result[key] = { old: null, new: value };
    }
  }
  return result;
}

/**
 * Column names on a table whose SQL type is PostGIS geography/geometry.
 * Derived from the schema rather than hardcoded, so a new spatial column on any
 * entity is excluded automatically.
 */
function geometryColumns(table: AnyTable): Set<string> {
  const names = new Set<string>();
  for (const [prop, column] of Object.entries(table)) {
    const sqlType = (column as { getSQLType?: () => string })?.getSQLType?.();
    if (typeof sqlType === "string" && /^(geography|geometry|box2d|box3d)/i.test(sqlType)) {
      names.add(prop);
    }
  }
  return names;
}

/**
 * Strip fields that are bookkeeping rather than content.
 *
 * Geometry is excluded: entity_versions holds ~100-byte deltas, while a single
 * territories.geography is megabytes. Spatial history belongs in
 * entity_geometry_versions, which stores it as PostGIS rather than JSONB.
 */
function toVersionableSnapshot(entity: Record<string, unknown>, table: AnyTable): Record<string, unknown> {
  const excluded = geometryColumns(table);
  excluded.add("searchVector");

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (!excluded.has(key)) result[key] = value;
  }
  return result;
}

/**
 * Guarantee a snapshot exists before any delta is written.
 *
 * `reconstructEntityAtVersion` throws if the earliest version has no snapshot,
 * so a delta written against an entity with no history is permanently
 * unreconstructable. The bulk backfill covers entities nobody has touched; this
 * covers the window before it runs, and any entity created outside it.
 *
 * The baseline is numbered with the entity's CURRENT version, not 1. An entity
 * already at v5 has had five states; recording its present state as "version 1"
 * would make every later reconstruction report the wrong history. Today no
 * entity is past v1, but sync will start bumping versions.
 *
 * Returns the highest version number now on record.
 *
 * Idempotent — concurrent callers race harmlessly on the
 * (entity_type, entity_id, version_number) unique constraint.
 */
async function ensureBaselineVersion(
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
    .where(and(eq(entityVersions.entityType, entityType), eq(entityVersions.entityId, entityId)));

  const highest = existing?.maxVersion != null ? Number(existing.maxVersion) : null;
  if (highest !== null) return highest;

  // Never below 1 — tables without a version column report 0.
  const baselineNumber = Math.max(currentVersion, 1);

  await tx
    .insert(entityVersions)
    .values({
      entityType,
      entityId,
      versionNumber: baselineNumber,
      snapshot: toVersionableSnapshot(currentState, table),
      delta: null,
      changedBy: "system",
      changeType: "create",
      changeSummary: "Initial recorded state",
      sourceType: "sync",
    })
    .onConflictDoNothing();

  return baselineNumber;
}

/**
 * Lock the entity row for the duration of the transaction.
 *
 * This is the concurrency control the contributions ERD specifies. It replaces
 * the previous compare-then-write, which could interleave with a concurrent
 * approval between the read and the update.
 */
async function lockEntityRow(tx: DbTransaction, entityType: EntityType, entityId: string): Promise<void> {
  const tableName = ENTITY_TABLE_NAMES[entityType];
  await tx.execute(sql`SELECT id FROM ${sql.identifier(tableName)} WHERE id = ${entityId} FOR UPDATE`);
}

// ---------------------------------------------------------------------------
// applyContribution
// ---------------------------------------------------------------------------

export async function applyContribution(
  tx: DbTransaction,
  contribution: ApplicableContribution,
  opts: {
    /** User id recorded as the author of the resulting version. */
    actorId: string;
    sourceType: VersionSourceType;
    changeType: ChangeType;
    now?: Date;
  }
): Promise<ApplyOutcome> {
  const { actorId, sourceType, changeType } = opts;
  const now = opts.now ?? new Date();

  const entityTable = getEntityTable(contribution.entityType);
  if (!entityTable) {
    throw new Error(`Unknown entity type: ${contribution.entityType}`);
  }
  const entityType = contribution.entityType as EntityType;
  const changes = normalizeChanges(contribution.changes);

  // Drizzle silently DROPS keys that are not columns, from both .set() and
  // .values() — it does not error. Without this check, approving an edit to a
  // misspelled field would report success, bump the version, and write an
  // entity_versions delta asserting a change that never happened. Auto-approval
  // is incidentally shielded by the community_editable_fields lookup; the
  // moderator path has no field validation at all.
  const unknownFields = Object.keys(changes).filter((field) => !tableHasColumn(entityTable, snakeToCamel(field)));
  if (unknownFields.length > 0) {
    return { status: "unknown_fields", fields: unknownFields };
  }

  // --- create ---------------------------------------------------------------
  if (changeType === "create") {
    const insertValues: Record<string, unknown> = {
      id: contribution.entityId,
      createdAt: now,
      updatedAt: now,
    };
    if (tableHasColumn(entityTable, "slug") && contribution.entitySlug) {
      insertValues.slug = contribution.entitySlug;
    }
    if (tableHasColumn(entityTable, "version")) {
      insertValues.version = 1;
    }
    if (tableHasColumn(entityTable, "submittedBy")) {
      insertValues.submittedBy = contribution.userId;
    }
    for (const [field, change] of Object.entries(changes)) {
      insertValues[snakeToCamel(field)] = change.new;
    }

    await tx.insert(entityTable).values(insertValues);

    const record = buildVersionRecord(
      entityType,
      contribution.entityId,
      1,
      toVersionableSnapshot(insertValues, entityTable),
      null,
      "create",
      actorId,
      contribution.editSummary
    );
    await tx.insert(entityVersions).values({
      ...record,
      changedAt: now,
      contributionId: contribution.id,
      sourceType,
    });

    return { status: "applied", appliedVersion: 1, changeType: "create" };
  }

  // --- update / delete ------------------------------------------------------
  // Lock first so the version check below cannot race a concurrent approval.
  await lockEntityRow(tx, entityType, contribution.entityId);

  const [entity] = await tx.select().from(entityTable).where(eq(entityTable.id, contribution.entityId)).limit(1);
  if (!entity) {
    return { status: "entity_missing" };
  }

  const hasVersionColumn = tableHasColumn(entityTable, "version");
  const currentVersion: number = entity.version ?? 0;

  // A table without a version column cannot be optimistically locked, so a
  // concurrent edit to it cannot be detected. Every contributable type has one.
  if (hasVersionColumn && currentVersion !== contribution.entityVersion) {
    return {
      status: "version_conflict",
      entityVersion: currentVersion,
      contributionVersion: contribution.entityVersion,
    };
  }

  const before = toVersionableSnapshot(entity as Record<string, unknown>, entityTable);
  const baselineVersion = await ensureBaselineVersion(
    tx,
    entityType,
    contribution.entityId,
    before,
    entityTable,
    currentVersion
  );

  // Derive the next version from whichever counter is further ahead. Without
  // the max() term, a table with no version column would compute 0 + 1 = 1 and
  // collide with the baseline row just written.
  const newVersion = Math.max(currentVersion, baselineVersion) + 1;
  const entityUpdates: Record<string, unknown> = { updatedAt: now };

  if (changeType === "delete") {
    entityUpdates.deletedAt = now;
  } else {
    for (const [field, change] of Object.entries(changes)) {
      entityUpdates[snakeToCamel(field)] = change.new;
    }
  }
  if (hasVersionColumn) {
    entityUpdates.version = newVersion;
  }

  await tx.update(entityTable).set(entityUpdates).where(eq(entityTable.id, contribution.entityId));

  // Version the change actually written to the row, not the change proposed.
  // A contribution whose value already matched reality records an empty delta
  // rather than inventing one.
  const after = { ...before, ...entityUpdates };
  const record = buildVersionRecord(
    entityType,
    contribution.entityId,
    newVersion,
    after,
    before,
    changeType,
    actorId,
    contribution.editSummary
  );
  await tx.insert(entityVersions).values({
    ...record,
    changedAt: now,
    contributionId: contribution.id,
    sourceType,
  });

  return { status: "applied", appliedVersion: newVersion, changeType };
}

// ---------------------------------------------------------------------------
// Contribution status transition
// ---------------------------------------------------------------------------

/** Mark a contribution as accepted. Call inside the same transaction. */
export async function markContributionApplied(
  tx: DbTransaction,
  contributionId: string,
  opts: {
    status: "approved" | "auto_approved";
    appliedVersion: number;
    reviewedBy: string | null;
    moderatorComment: string | null;
    autoApproved?: boolean;
    now?: Date;
  }
): Promise<void> {
  const now = opts.now ?? new Date();
  await tx
    .update(contributions)
    .set({
      status: opts.status,
      autoApproved: opts.autoApproved ?? false,
      reviewedBy: opts.reviewedBy,
      reviewedAt: now,
      moderatorComment: opts.moderatorComment,
      appliedVersion: opts.appliedVersion,
      updatedAt: now,
    })
    .where(eq(contributions.id, contributionId));
}
