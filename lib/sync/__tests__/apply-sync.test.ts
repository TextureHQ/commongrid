import { describe, expect, it, vi } from "vitest";
import { getPooledDb } from "@/lib/db/client-pooled";
import { changeBatches, entityVersions } from "@/lib/db/schema";
import type { SyncRecord } from "../apply-sync";
import { applySync } from "../apply-sync";
import * as fieldProvenance from "../field-provenance";

vi.mock("@/lib/db/client-pooled", () => ({ getPooledDb: vi.fn() }));

vi.mock("../field-provenance", async () => {
  const actual = await vi.importActual<typeof import("../field-provenance")>("../field-provenance");
  return { ...actual, getHumanLockedFields: vi.fn() };
});

interface FakeState {
  /** The entity row currently in the table, or null for a create. */
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
  batchInserts: Record<string, unknown>[];
  batchUpdates: Record<string, unknown>[];
  lockedRows: number;
}

/**
 * Minimal stand-in for a Drizzle transaction. Only models the exact call
 * shapes that `applySync` and its helpers use.
 */
function makeTx(state: FakeState) {
  const recorded: Recorded = {
    entityInserts: [],
    entityUpdates: [],
    versionInserts: [],
    batchInserts: [],
    batchUpdates: [],
    lockedRows: 0,
  };

  const highestVersion = state.hasVersionHistory ? (state.highestVersion ?? 1) : null;

  const valuesResult = (table: unknown) => {
    const promise = Promise.resolve(undefined);
    return Object.assign(promise, {
      onConflictDoNothing: () => Promise.resolve(undefined),
      returning: () => Promise.resolve(table === changeBatches ? [{ id: "batch-1" }] : []),
    });
  };

  const tx = {
    execute: vi.fn(async () => {
      recorded.lockedRows++;
      return { rows: [] };
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = (() => {
            if (table === entityVersions) {
              // Aggregate read used by ensureBaseline.
              return [{ maxVersion: highestVersion }];
            }
            return state.entity ? [state.entity] : [];
          })();

          return Object.assign(Promise.resolve(rows), {
            limit: async () => rows,
            orderBy: async () => rows,
          });
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (table === changeBatches) recorded.batchInserts.push(v);
        else if (table === entityVersions) recorded.versionInserts.push(v);
        else recorded.entityInserts.push(v);
        return valuesResult(table);
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          if (table === changeBatches) recorded.batchUpdates.push(v);
          else recorded.entityUpdates.push(v);
          return undefined;
        },
      }),
    })),
  };

  return { tx: tx as unknown as Parameters<Parameters<ReturnType<typeof getPooledDb>["transaction"]>[0]>[0], recorded };
}

function record(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    entityId: "u-1",
    sourceId: "eia-861",
    asOf: new Date("2025-01-01T00:00:00Z"),
    fields: {},
    ...overrides,
  };
}

const baseOpts = {
  entityType: "utility" as const,
  initiatedBy: "sync:eia-861",
  batchTitle: "EIA-861 monthly sync",
  now: new Date("2026-09-14T12:00:00.000Z"),
};

describe("applySync", () => {
  it.each([
    { sourceId: "" },
    { sourceId: undefined },
    { asOf: undefined },
    { asOf: new Date("invalid") },
    { asOf: "2025-01-01" },
  ])("rejects malformed provenance before opening a transaction: %j", async (overrides) => {
    vi.mocked(getPooledDb).mockClear();
    await expect(applySync([record(overrides as Partial<SyncRecord>)], baseOpts)).rejects.toThrow();
    expect(getPooledDb).not.toHaveBeenCalled();
  });

  it("preserves unknown vintage instead of substituting the ingest timestamp", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    await applySync([record({ asOf: null, fields: { name: "Unknown vintage" } })], baseOpts);
    expect(recorded.versionInserts[0]).toMatchObject({ sourceId: "eia-861", asOf: null, changedAt: baseOpts.now });
  });

  it("does not attribute the old baseline to the incoming source", async () => {
    const { tx, recorded } = makeTx({ entity: { id: "u-1", version: 3, name: "Old" }, hasVersionHistory: false });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());
    await applySync([record({ fields: { name: "New" } })], baseOpts);
    expect(recorded.versionInserts).toHaveLength(2);
    expect(recorded.versionInserts[0]?.sourceId).toBeUndefined();
    expect(recorded.versionInserts[0]?.asOf).toBeUndefined();
    expect(recorded.versionInserts[1]).toMatchObject({ sourceId: "eia-861", asOf: new Date("2025-01-01T00:00:00Z") });
  });

  it("creates a new entity and writes a v1 snapshot version row", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());

    const report = await applySync(
      [
        record({
          slug: "acme-electric",
          fields: { name: "Acme Electric", customerCount: 100 },
        }),
      ],
      baseOpts
    );

    expect(report).toMatchObject({
      batchId: "batch-1",
      created: 1,
      updated: 0,
      unchanged: 0,
      deferrals: [],
      fieldsWritten: 7,
    });

    expect(recorded.entityInserts).toHaveLength(1);
    expect(recorded.entityInserts[0]).toMatchObject({
      id: "u-1",
      slug: "acme-electric",
      version: 1,
      name: "Acme Electric",
      customerCount: 100,
    });

    expect(recorded.versionInserts).toHaveLength(1);
    const version = recorded.versionInserts[0];
    expect(version).toMatchObject({
      entityType: "utility",
      entityId: "u-1",
      versionNumber: 1,
      delta: null,
      changeType: "create",
      sourceType: "sync",
      sourceId: "eia-861",
      asOf: new Date("2025-01-01T00:00:00Z"),
      batchId: "batch-1",
      changedBy: "sync:eia-861",
      changeSummary: "Added via sync:eia-861",
    });
    expect(version?.snapshot).toMatchObject({
      id: "u-1",
      slug: "acme-electric",
      name: "Acme Electric",
      customerCount: 100,
    });
  });

  it("treats a matching record as unchanged and writes no version row", async () => {
    const { tx, recorded } = makeTx({
      entity: {
        id: "u-1",
        version: 2,
        name: "Acme Electric",
        customerCount: 100,
      },
      hasVersionHistory: true,
      highestVersion: 2,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());

    const report = await applySync([record({ fields: { name: "Acme Electric", customerCount: 100 } })], baseOpts);

    expect(report).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      deferrals: [],
      fieldsWritten: 0,
    });

    expect(recorded.entityInserts).toHaveLength(0);
    expect(recorded.entityUpdates).toHaveLength(0);
    expect(recorded.versionInserts).toHaveLength(0);
    expect(recorded.batchUpdates[0]?.versionCount).toBe(0);
  });

  it("updates a changed non-locked field with a delta version row", async () => {
    const { tx, recorded } = makeTx({
      entity: {
        id: "u-1",
        version: 2,
        name: "Old Name",
        customerCount: 100,
      },
      hasVersionHistory: true,
      highestVersion: 2,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());

    const report = await applySync([record({ fields: { name: "New Name" } })], baseOpts);

    expect(report).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
      deferrals: [],
      fieldsWritten: 1,
    });

    expect(recorded.entityUpdates).toHaveLength(1);
    expect(recorded.entityUpdates[0]).toMatchObject({
      name: "New Name",
      version: 3,
    });

    expect(recorded.versionInserts).toHaveLength(1);
    const version = recorded.versionInserts[0];
    expect(version).toMatchObject({
      entityType: "utility",
      entityId: "u-1",
      versionNumber: 3,
      snapshot: null,
      changeType: "update",
      sourceType: "sync",
      sourceId: "eia-861",
      asOf: new Date("2025-01-01T00:00:00Z"),
      batchId: "batch-1",
      changedBy: "sync:eia-861",
    });
    expect(version?.delta).toMatchObject({
      name: { old: "Old Name", new: "New Name" },
    });
  });

  it("skips human-locked fields and reports them as deferrals", async () => {
    const { tx, recorded } = makeTx({
      entity: {
        id: "u-1",
        version: 2,
        name: "Human Name",
        customerCount: 100,
      },
      hasVersionHistory: true,
      highestVersion: 2,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set(["name"]));

    const report = await applySync([record({ fields: { name: "Sync Name" } })], baseOpts);

    expect(report).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      fieldsWritten: 0,
    });

    expect(report.deferrals).toHaveLength(1);
    expect(report.deferrals[0]).toEqual({
      entityId: "u-1",
      field: "name",
      keptValue: "Human Name",
      skippedValue: "Sync Name",
    });

    expect(recorded.entityUpdates).toHaveLength(0);
    expect(recorded.versionInserts).toHaveLength(0);
  });

  it("applies only unlocked fields when a record mixes locked and unlocked changes", async () => {
    const { tx, recorded } = makeTx({
      entity: {
        id: "u-1",
        version: 2,
        name: "Human Name",
        customerCount: 100,
      },
      hasVersionHistory: true,
      highestVersion: 2,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set(["name"]));

    const report = await applySync([record({ fields: { name: "Sync Name", customerCount: 200 } })], baseOpts);

    expect(report).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
      fieldsWritten: 1,
    });

    expect(report.deferrals).toHaveLength(1);
    expect(report.deferrals[0]).toMatchObject({ field: "name" });

    expect(recorded.entityUpdates).toHaveLength(1);
    expect(recorded.entityUpdates[0]).toMatchObject({ customerCount: 200 });
    expect(recorded.entityUpdates[0]).not.toHaveProperty("name");

    expect(recorded.versionInserts).toHaveLength(1);
    expect(recorded.versionInserts[0]?.delta).toMatchObject({
      customerCount: { old: 100, new: 200 },
    });
    expect(recorded.versionInserts[0]?.delta).not.toHaveProperty("name");
  });

  it("opens exactly one batch row and sets versionCount to the number of version rows written", async () => {
    const { tx, recorded } = makeTx({ entity: null, hasVersionHistory: false });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());

    const report = await applySync(
      [
        record({
          entityId: "u-1",
          slug: "u-1-slug",
          fields: { name: "One" },
        }),
        record({
          entityId: "u-2",
          slug: "u-2-slug",
          fields: { name: "Two" },
        }),
      ],
      baseOpts
    );

    expect(report.created).toBe(2);
    expect(recorded.batchInserts).toHaveLength(1);
    expect(recorded.batchInserts[0]).toMatchObject({
      sourceType: "sync",
      title: "EIA-861 monthly sync",
      initiatedBy: "sync:eia-861",
      startedAt: baseOpts.now,
    });

    const lastBatchUpdate = recorded.batchUpdates[recorded.batchUpdates.length - 1];
    expect(lastBatchUpdate).toMatchObject({ versionCount: 2 });
    expect(lastBatchUpdate).toHaveProperty("completedAt");
  });

  it("ignores fields that are not real columns on the table", async () => {
    const { tx, recorded } = makeTx({
      entity: {
        id: "u-1",
        version: 2,
        name: "Old Name",
        customerCount: 100,
      },
      hasVersionHistory: true,
      highestVersion: 2,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as unknown,
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());

    const report = await applySync(
      [
        record({
          fields: {
            customerCount: 200,
            notAColumnInRealTable: "should be ignored",
          },
        }),
      ],
      baseOpts
    );

    expect(report).toMatchObject({
      updated: 1,
      fieldsWritten: 1,
    });
    expect(recorded.entityUpdates[0]).toMatchObject({ customerCount: 200 });
    expect(recorded.entityUpdates[0]).not.toHaveProperty("notAColumnInRealTable");
  });
});

describe("tariff sync JSONB stability", () => {
  it("does not write a new version when PostgreSQL reorders nested JSON keys", async () => {
    const { tx, recorded } = makeTx({
      entity: { id: "tariff-1", version: 1, rawRecord: { name: "Rate", structure: [{ rate: 1, unit: "kWh" }] } },
      hasVersionHistory: true,
    });
    vi.mocked(getPooledDb).mockReturnValue({
      transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    } as unknown as ReturnType<typeof getPooledDb>);
    vi.mocked(fieldProvenance.getHumanLockedFields).mockResolvedValue(new Set());
    const report = await applySync(
      [
        record({
          entityId: "tariff-1",
          fields: { rawRecord: { structure: [{ unit: "kWh", rate: 1 }], name: "Rate" } },
        }),
      ],
      { ...baseOpts, entityType: "tariff" }
    );
    expect(report.unchanged).toBe(1);
    expect(recorded.versionInserts).toHaveLength(0);
    expect(recorded.entityUpdates).toHaveLength(0);
  });
});
