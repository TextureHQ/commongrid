/**
 * Unit tests for point-in-time `?at=` parsing and path eligibility.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  asOfMeta,
  enforceAtQueryPolicy,
  type PointInTimeSnapshot,
  parseAtParam,
  supportsPointInTimeReads,
} from "@/lib/api/point-in-time";
import { dbRowToProgram } from "@/lib/data/programs";
import { reconstructEntityAtVersion } from "@/lib/db/versioning";

describe("parseAtParam", () => {
  it("returns null when at is absent", () => {
    expect(parseAtParam(new URLSearchParams("state=CA"))).toBeNull();
  });

  it("treats YYYY-MM-DD as end of that UTC day", () => {
    const at = parseAtParam(new URLSearchParams("at=2025-12-01"));
    expect(at?.toISOString()).toBe("2025-12-01T23:59:59.999Z");
  });

  it("accepts an ISO-8601 timestamp", () => {
    const at = parseAtParam(new URLSearchParams("at=2025-12-01T15:30:00.000Z"));
    expect(at?.toISOString()).toBe("2025-12-01T15:30:00.000Z");
  });

  it("rejects empty at=", () => {
    expect(() => parseAtParam(new URLSearchParams("at="))).toThrow(ApiError);
  });

  it("rejects unparseable values", () => {
    expect(() => parseAtParam(new URLSearchParams("at=not-a-date"))).toThrow(ApiError);
  });
});

describe("supportsPointInTimeReads", () => {
  it("allows versioned slug detail paths", () => {
    expect(supportsPointInTimeReads("/api/v1/utilities/austin-energy")).toBe(true);
    expect(supportsPointInTimeReads("/api/v1/power-plants/palo-verde")).toBe(true);
    expect(supportsPointInTimeReads("/api/v1/balancing-authorities/ercot")).toBe(true);
  });

  it("rejects list and sub-resource paths", () => {
    expect(supportsPointInTimeReads("/api/v1/utilities")).toBe(false);
    expect(supportsPointInTimeReads("/api/v1/utilities/austin-energy/versions")).toBe(false);
    expect(supportsPointInTimeReads("/api/v1/utilities/austin-energy/geometry")).toBe(false);
    expect(supportsPointInTimeReads("/api/v1/territories/lookup")).toBe(false);
  });
});

describe("enforceAtQueryPolicy", () => {
  it("allows at= on eligible detail paths", () => {
    expect(() =>
      enforceAtQueryPolicy(new URL("https://commongrid.info/api/v1/utilities/x?at=2025-12-01"))
    ).not.toThrow();
  });

  it("rejects at= on list endpoints", () => {
    try {
      enforceAtQueryPolicy(new URL("https://commongrid.info/api/v1/utilities?at=2025-12-01"));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.code).toBe("VALIDATION_ERROR");
      expect(e.message).toMatch(/detail endpoints/i);
    }
  });
});

describe("historical loader normalization", () => {
  it("normalizes program snapshots to the live public shape", () => {
    const program = dbRowToProgram({
      id: "program-1",
      slug: "acme-program",
      name: "Acme Program",
      organizations: ["utility-1"],
      assetTypes: [],
      marketSegments: [],
      participationModels: [],
      incentiveStructures: [],
      gridServices: [],
      regions: [],
      compensationTiers: ["flat-rate"],
      status: "ACTIVE",
      variants: [],
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-02T00:00:00.000Z"),
      version: 3,
      source: "internal-only",
    });

    expect(program.organizations).toEqual([{ entityId: "utility-1", role: "ADMINISTRATOR" }]);
    expect(program.compensationTiers).toEqual([{ tier: 1, type: "FLAT", amount: 0, unit: "FLAT" }]);
    expect(program.version).toBe(3);
    expect(program).not.toHaveProperty("source");
  });
});

describe("asOfMeta + reconstruction", () => {
  it("rebuilds entity state at a target version", () => {
    const versions = [
      {
        versionNumber: 1,
        snapshot: { id: "u1", slug: "acme", name: "Acme", customerCount: 100 },
        delta: null,
      },
      {
        versionNumber: 2,
        snapshot: null,
        delta: { customerCount: { old: 100, new: 250 }, name: { old: "Acme", new: "Acme Energy" } },
      },
    ];
    const entity = reconstructEntityAtVersion(versions, 2);
    expect(entity).toEqual({ id: "u1", slug: "acme", name: "Acme Energy", customerCount: 250 });
    if (!entity) throw new Error("expected reconstructed entity");

    const snap: PointInTimeSnapshot = {
      entity,
      versionNumber: 2,
      changedAt: new Date("2025-06-01T00:00:00.000Z"),
      requestedAt: new Date("2025-12-01T23:59:59.999Z"),
    };
    expect(asOfMeta(snap)).toEqual({
      requested: "2025-12-01T23:59:59.999Z",
      versionNumber: 2,
      changedAt: "2025-06-01T00:00:00.000Z",
    });
  });
});
