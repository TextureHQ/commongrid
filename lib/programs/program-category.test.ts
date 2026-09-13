import { describe, expect, it } from "vitest";

import { AssetType, type Program } from "@/types/programs";
import { getProgramMapCategory, summarizePrograms } from "./program-category";

function program(slug: string, assetTypes: AssetType[], capacityTarget?: number, maxEnrollments?: number): Program {
  return {
    id: slug,
    slug,
    name: slug,
    version: 1,
    organizations: [],
    assetTypes,
    deviceTypes: [],
    marketSegments: [],
    participationModels: [],
    incentiveStructures: [],
    gridServices: [],
    regions: [],
    compensationTiers: [],
    status: "ACTIVE",
    variants: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    capacityTarget,
    maxEnrollments,
  };
}

describe("program category helpers", () => {
  it("uses the highest-priority asset type as the map category", () => {
    expect(getProgramMapCategory(program("mixed", [AssetType.SOLAR_PV, AssetType.BATTERY]))).toBe(AssetType.BATTERY);
  });

  it("summarizes program totals and category counts", () => {
    const summary = summarizePrograms([
      program("battery", [AssetType.BATTERY], 2.5, 100),
      program("thermostat", [AssetType.THERMOSTAT], 1, 25),
      program("solar", [AssetType.SOLAR_PV], undefined, undefined),
    ]);

    expect(summary.programCount).toBe(3);
    expect(summary.capacityTargetMw).toBe(3.5);
    expect(summary.maxEnrollments).toBe(125);
    expect(summary.categoryCounts[AssetType.BATTERY]).toBe(1);
    expect(summary.categoryCounts[AssetType.THERMOSTAT]).toBe(1);
    expect(summary.categoryCounts[AssetType.SOLAR_PV]).toBe(1);
  });
});
