import { describe, expect, it, vi } from "vitest";
import { entityVersions } from "@/lib/db/schema";
import { type ApplicableContribution, applyContribution, normalizeChanges } from "../apply-contribution";

// ---------------------------------------------------------------------------
// Fake transaction
// ---------------------------------------------------------------------------

interface FakeState {
  /** Row returned by the entity select, or null for "entity is gone". */
  entity: Record<string, unknown> | null;
  /** Whether entity_versions already holds rows for the target entity. */
  hasVersionHistory: boolean;
  /** Highest existing version_number, when hasVersionHistory. Defaults to 1. */
  highestVersion?: number;
}

interface Recorded {
  entityInserts: Record<string, unknown>[];
  entityUpdates: Record<string, unknown>[];
  versionInserts: Record<string, unknown>[];
  lockedRows: number;
}

/**
 * Minimal stand-in for a drizzle transaction. Only models the call shapes
 * applyContribution actually uses. Behaviour against a real database is
 * covered by the verification run recorded in the PR description.
 */
function makeTx(state: FakeState) {
  const recorded: Recorded = {
    entityInserts: [],
    entityUpdates: [],
    versionInserts: [],
    lockedRows: 0,
  };

  // Reads and writes are routed by table identity rather than call order, so
  // the fake keeps working if applyContribution reorders its queries.
  const isVersionsTable = (table: unknown) => table === entityVersions;

  /** `.values()` is awaited directly in some places and chained with
   *  `.onConflictDoNothing()` in others, so it must be both. */
  const valuesResult = () => {
    const promise = Promise.resolve(undefined);
    return Object.assign(promise, { onConflictDoNothing: () => Promise.resolve(undefined) });
  };

  const tx = {
    execute: vi.fn(async () => {
      recorded.lockedRows++;
      return { rows: [] };
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        // `where()` is awaited directly for the aggregate that reads the
        // highest existing version, and chained with `.limit()` for the entity
        // read, so it must be both.
        where: () => {
          const rows = () => {
            if (isVersionsTable(table)) {
              // max(version_number) over existing rows.
              return state.hasVersionHistory ? [{ maxVersion: state.highestVersion ?? 1 }] : [{ maxVersion: null }];
            }
            return state.entity ? [state.entity] : [];
          };
          return Object.assign(Promise.resolve(rows()), { limit: async () => rows() });
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (isVersionsTable(table)) recorded.versionInserts.push(v);
        else recorded.entityInserts.push(v);
        return valuesResult();
      },
    })),
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          recorded.entityUpdates.push(v);
          return undefined;
        },
      }),
    })),
  };

  // biome-ignore lint/suspicious/noExplicitAny: structural stand-in for a drizzle tx
  return { tx: tx as any, recorded };
}

function contribution(overrides: Partial<ApplicableContribution> = {}): ApplicableContribution {
  return {
    id: "contrib-1",
    entityType: "utility",
    entityId: "entity-1",
    entitySlug: "acme-electric",
    entityVersion: 3,
    changes: { ami_meter_count: { old: 100, new: 200 } },
    editSummary: "Updated AMI meter count from the utility's published report",
    changeType: "update",
    userId: "user-1",
    ...overrides,
  };
}

const opts = { actorId: "moderator-1", sourceType: "community" as const, now: new Date("2026-08-13T12:00:00Z") };

// ---------------------------------------------------------------------------

describe("normalizeChanges", () => {
  it("passes through the canonical { old, new } shape", () => {
    expect(normalizeChanges({ website: { old: "a", new: "b" } })).toEqual({ website: { old: "a", new: "b" } });
  });

  it("wraps the flat { field: value } shape EditEntityPanel can send", () => {
    expect(normalizeChanges({ website: "b" })).toEqual({ website: { old: null, new: "b" } });
  });

  it("treats arrays as values rather than as a change object", () => {
    expect(normalizeChanges({ states: ["CA", "NV"] })).toEqual({ states: { old: null, new: ["CA", "NV"] } });
  });

  it("tolerates null and non-object input", () => {
    expect(normalizeChanges(null)).toEqual({});
    expect(normalizeChanges("nonsense")).toEqual({});
  });
});

describe("applyContribution", () => {
  it("refuses fields that are not columns, instead of silently dropping them", async () => {
    // Drizzle drops unknown keys from .set() rather than erroring, so without
    // this the approval would report success, bump the version, and write a
    // delta asserting a change that never happened.
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, amiMeterCount: 100 },
      hasVersionHistory: true,
    });

    const outcome = await applyContribution(
      tx,
      contribution({ changes: { ami_metre_count: { old: 100, new: 200 } } }),
      { ...opts, changeType: "update" }
    );

    expect(outcome).toEqual({ status: "unknown_fields", fields: ["ami_metre_count"] });
    expect(recorded.entityUpdates).toHaveLength(0);
    expect(recorded.versionInserts).toHaveLength(0);
  });

  it("checks fields on creates too", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });

    const outcome = await applyContribution(
      tx,
      contribution({ changeType: "create", changes: { nope: { old: null, new: "x" } } }),
      { ...opts, changeType: "create" }
    );

    expect(outcome).toEqual({ status: "unknown_fields", fields: ["nope"] });
    expect(recorded.entityInserts).toHaveLength(0);
  });

  it("accepts snake_case names that map to a real column", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, totalMeterCount: 1 },
      hasVersionHistory: true,
    });

    const outcome = await applyContribution(tx, contribution({ changes: { total_meter_count: { old: 1, new: 2 } } }), {
      ...opts,
      changeType: "update",
    });

    expect(outcome).toMatchObject({ status: "applied" });
    expect(recorded.entityUpdates[0]).toHaveProperty("totalMeterCount", 2);
  });

  it("declines when the entity moved on, without writing anything", async () => {
    const { tx, recorded } = makeTx({ entity: { id: "entity-1", version: 7 }, hasVersionHistory: true });

    const outcome = await applyContribution(tx, contribution({ entityVersion: 3 }), { ...opts, changeType: "update" });

    expect(outcome).toEqual({ status: "version_conflict", entityVersion: 7, contributionVersion: 3 });
    expect(recorded.entityUpdates).toHaveLength(0);
    expect(recorded.versionInserts).toHaveLength(0);
  });

  it("reports a missing entity rather than resurrecting it", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });

    const outcome = await applyContribution(tx, contribution(), { ...opts, changeType: "update" });

    expect(outcome).toEqual({ status: "entity_missing" });
    expect(recorded.entityUpdates).toHaveLength(0);
  });

  it("applies an update, bumps the version and writes a delta row", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, amiMeterCount: 100 },
      hasVersionHistory: true,
    });

    const outcome = await applyContribution(tx, contribution(), { ...opts, changeType: "update" });

    expect(outcome).toEqual({ status: "applied", appliedVersion: 4, changeType: "update" });
    expect(recorded.entityUpdates[0]).toMatchObject({ amiMeterCount: 200, version: 4 });

    const version = recorded.versionInserts[recorded.versionInserts.length - 1];
    expect(version).toMatchObject({ versionNumber: 4, changeType: "update", contributionId: "contrib-1" });
    expect(version?.snapshot).toBeNull();
    expect(version?.delta).toMatchObject({ amiMeterCount: { old: 100, new: 200 } });
  });

  it("locks the entity row before reading its version", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, amiMeterCount: 100 },
      hasVersionHistory: true,
    });

    await applyContribution(tx, contribution(), { ...opts, changeType: "update" });

    expect(recorded.lockedRows).toBe(1);
  });

  it("numbers the baseline with the entity's current version, not 1", async () => {
    // An entity already at v3 has had three states. Recording its present state
    // as "version 1" would make every later reconstruction report the wrong
    // history.
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, amiMeterCount: 100 },
      hasVersionHistory: false,
    });

    const outcome = await applyContribution(tx, contribution({ entityVersion: 3 }), { ...opts, changeType: "update" });

    const baseline = recorded.versionInserts.find((v) => v.delta === null);
    expect(baseline).toMatchObject({ versionNumber: 3 });
    expect(baseline?.snapshot).toMatchObject({ id: "entity-1", amiMeterCount: 100 });

    // The delta then continues from there rather than colliding with it.
    expect(outcome).toEqual({ status: "applied", appliedVersion: 4, changeType: "update" });
    expect(recorded.versionInserts.map((v) => v.versionNumber)).toEqual([3, 4]);
  });

  it("writes a baseline snapshot before the first delta, so history stays reconstructable", async () => {
    // reconstructEntityAtVersion throws if the earliest version has no
    // snapshot, so a delta must never be the first row for an entity.
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 1, amiMeterCount: 100 },
      hasVersionHistory: false,
    });

    await applyContribution(tx, contribution({ entityVersion: 1 }), { ...opts, changeType: "update" });

    const baseline = recorded.versionInserts.find((v) => v.versionNumber === 1);
    expect(baseline).toBeDefined();
    expect(baseline?.snapshot).toMatchObject({ id: "entity-1", amiMeterCount: 100 });
    expect(baseline?.delta).toBeNull();
    expect(recorded.versionInserts).toHaveLength(2);
  });

  it("soft-deletes rather than removing the row, and versions the deletion", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, amiMeterCount: 100 },
      hasVersionHistory: true,
    });

    const outcome = await applyContribution(tx, contribution({ changeType: "delete" }), {
      ...opts,
      changeType: "delete",
    });

    expect(outcome).toEqual({ status: "applied", appliedVersion: 4, changeType: "delete" });
    expect(recorded.entityUpdates[0]).toHaveProperty("deletedAt");
    expect(recorded.versionInserts[recorded.versionInserts.length - 1]).toMatchObject({ changeType: "delete" });
  });

  it("creates at version 1 with a full snapshot and no lock", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });

    const outcome = await applyContribution(
      tx,
      contribution({ changeType: "create", changes: { name: { old: null, new: "Acme Electric" } } }),
      { ...opts, changeType: "create" }
    );

    expect(outcome).toEqual({ status: "applied", appliedVersion: 1, changeType: "create" });
    expect(recorded.entityInserts[0]).toMatchObject({ id: "entity-1", slug: "acme-electric", version: 1 });
    expect(recorded.versionInserts[0]).toMatchObject({ versionNumber: 1, changeType: "create" });
    expect(recorded.versionInserts[0]?.delta).toBeNull();
    // Nothing exists yet, so there is no row to lock.
    expect(recorded.lockedRows).toBe(0);
  });

  it("does not collide with its own baseline when the table has no version column", async () => {
    // Regression: currentVersion fell back to 0, ensureBaselineVersion wrote
    // version_number 1, then 0 + 1 = 1 was written again — violating the
    // (entity_type, entity_id, version_number) unique constraint.
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", amiMeterCount: 100 }, // no `version` key
      hasVersionHistory: false,
    });

    const outcome = await applyContribution(tx, contribution({ entityVersion: 0 }), {
      ...opts,
      changeType: "update",
    });

    expect(outcome).toEqual({ status: "applied", appliedVersion: 2, changeType: "update" });

    const versionNumbers = recorded.versionInserts.map((v) => v.versionNumber);
    expect(versionNumbers).toEqual([1, 2]);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
  });

  it("excludes PostGIS columns given snake_case keys too", async () => {
    // The exclusion list was built from Drizzle property names only, so a row
    // keyed by SQL column name — what to_jsonb() returns — slipped multi-word
    // geometry columns through while single-word ones matched by coincidence.
    // The backfill hit exactly this and shipped 29 MB of leaked geometry.
    const { tx, recorded } = makeTx({
      entity: {
        id: "territory-1",
        version: 1,
        source: "Some Source",
        geography: "0106000020E6100000...",
        simplified_1km: "0106000020E6100000...",
      },
      hasVersionHistory: false,
    });

    await applyContribution(
      tx,
      contribution({ entityType: "territory", entityVersion: 1, changes: { source: { old: "a", new: "b" } } }),
      { ...opts, changeType: "update" }
    );

    const snapshot = recorded.versionInserts.find((v) => v.versionNumber === 1)?.snapshot as Record<string, unknown>;
    expect(snapshot).toHaveProperty("source");
    expect(snapshot).not.toHaveProperty("geography");
    expect(snapshot).not.toHaveProperty("simplified_1km");
  });

  it("excludes PostGIS columns from snapshots", async () => {
    // entity_versions holds ~100-byte deltas; a single territories.geography is
    // megabytes. Spatial history belongs in entity_geometry_versions.
    const { tx, recorded } = makeTx({
      entity: {
        id: "territory-1",
        version: 1,
        source: "Some Source",
        geography: "0106000020E6100000...",
        geometry: "0106000020E6100000...",
        simplified1km: "0106000020E6100000...",
        centroid: "0101000020E6100000...",
      },
      hasVersionHistory: false,
    });

    await applyContribution(
      tx,
      // `source` is a real territories column — territories has no `name`,
      // and the field check would (correctly) reject it.
      contribution({ entityType: "territory", entityVersion: 1, changes: { source: { old: "a", new: "b" } } }),
      { ...opts, changeType: "update" }
    );

    const baseline = recorded.versionInserts.find((v) => v.versionNumber === 1);
    const snapshot = baseline?.snapshot as Record<string, unknown>;
    expect(snapshot).toHaveProperty("source");
    for (const col of ["geography", "geometry", "simplified1km", "centroid"]) {
      expect(snapshot).not.toHaveProperty(col);
    }
  });

  it("converts snake_case field names to the Drizzle property names", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "entity-1", version: 3, totalMeterCount: 1 },
      hasVersionHistory: true,
    });

    await applyContribution(tx, contribution({ changes: { total_meter_count: { old: 1, new: 2 } } }), {
      ...opts,
      changeType: "update",
    });

    expect(recorded.entityUpdates[0]).toHaveProperty("totalMeterCount", 2);
    expect(recorded.entityUpdates[0]).not.toHaveProperty("total_meter_count");
  });
});
