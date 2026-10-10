import { describe, expect, it, vi } from "vitest";
import { fieldModerationState } from "@/lib/db/schema";
import type { DbTransaction } from "../apply-contribution";
import {
  getModerationLockedFields,
  releaseFieldModerationState,
  upsertFieldModerationState,
} from "../field-moderation-state";

interface Recorded {
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}

/**
 * Minimal stand-in for a Drizzle transaction that captures the upsert/release
 * call shapes without needing a live Postgres.
 */
function makeTx() {
  const recorded: Recorded = {
    inserts: [],
    updates: [],
  };

  const tx = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (table === fieldModerationState) recorded.inserts.push(v);
        return Object.assign(Promise.resolve(undefined), {
          onConflictDoUpdate: () => Promise.resolve(undefined),
        });
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: (_w: Record<string, unknown>) => {
          if (table === fieldModerationState) {
            recorded.updates.push(v);
          }
          return Promise.resolve(undefined);
        },
      }),
    })),
  };

  // biome-ignore lint/suspicious/noExplicitAny: structural stand-in for a drizzle tx
  return { tx: tx as any, recorded };
}

const baseInput = {
  entityType: "utility",
  entityId: "u-1",
  fieldName: "name",
  approvedValue: "Approved Name",
  verificationType: "moderator" as const,
  contributionId: "contrib-1",
  reviewedBy: "moderator-1",
  sourceCitationId: null as string | null,
};

describe("upsertFieldModerationState", () => {
  it("inserts an active row for a newly approved field", async () => {
    const { tx, recorded } = makeTx();
    await upsertFieldModerationState(tx, baseInput);

    expect(recorded.inserts).toHaveLength(1);
    expect(recorded.inserts[0]).toMatchObject({
      entityType: "utility",
      entityId: "u-1",
      fieldName: "name",
      approvedValue: "Approved Name",
      status: "active",
      verificationType: "moderator",
      contributionId: "contrib-1",
      reviewedBy: "moderator-1",
      releasedAt: null,
      releasedBy: null,
      releaseReason: null,
    });
  });

  it("records auto_approved verification type and no reviewer", async () => {
    const { tx, recorded } = makeTx();
    await upsertFieldModerationState(tx, {
      ...baseInput,
      verificationType: "auto_approved",
      reviewedBy: null,
    });

    expect(recorded.inserts[0]).toMatchObject({
      verificationType: "auto_approved",
      reviewedBy: null,
    });
  });

  it("preserves approved null values in jsonb", async () => {
    const { tx, recorded } = makeTx();
    await upsertFieldModerationState(tx, { ...baseInput, approvedValue: null });

    expect(recorded.inserts[0]).toMatchObject({ approvedValue: null });
  });
});

describe("releaseFieldModerationState", () => {
  it("sets status to released and records release metadata", async () => {
    const { tx, recorded } = makeTx();
    const now = new Date("2026-10-10T00:00:00.000Z");
    await releaseFieldModerationState(tx, {
      entityType: "utility",
      entityId: "u-1",
      fieldName: "name",
      releasedBy: "moderator-1",
      releaseReason: "Upstream source corrected",
      now,
    });

    expect(recorded.updates).toHaveLength(1);
    expect(recorded.updates[0]).toMatchObject({
      status: "released",
      releasedBy: "moderator-1",
      releaseReason: "Upstream source corrected",
      updatedAt: now,
    });
  });
});

describe("getModerationLockedFields", () => {
  it("returns field names with active rows", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => Promise.resolve([{ fieldName: "name" }, { fieldName: "website" }]),
        }),
      })),
    };

    const locked = await getModerationLockedFields(tx as unknown as Pick<DbTransaction, "select">, "utility", "u-1");
    expect(locked).toEqual(new Set(["name", "website"]));
  });

  it("returns an empty set when no active rows exist", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      })),
    };

    const locked = await getModerationLockedFields(tx as unknown as Pick<DbTransaction, "select">, "utility", "u-1");
    expect(locked).toEqual(new Set());
  });
});
