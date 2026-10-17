import { describe, expect, it } from "vitest";
import { collectProgramBoundaryPrep } from "./program-boundaries";

const palette = ["#111111", "#222222", "#333333"];

describe("collectProgramBoundaryPrep", () => {
  it("keeps shared territories under every program while fetching each territory once", () => {
    const programs = [
      { slug: "alpha", name: "Alpha", status: "ACTIVE", regions: ["r1", "r2"] },
      { slug: "beta", name: "Beta", status: "ACTIVE", regions: ["r2", "r3"] },
      { slug: "gamma", name: "Gamma", status: "ACTIVE", regions: ["r3", "r3", "missing"] },
    ] as const;

    const regionById = new Map([
      ["r1", { slug: "shared-one" }],
      ["r2", { slug: "shared-two" }],
      ["r3", { slug: "shared-three" }],
    ]);

    const prep = collectProgramBoundaryPrep(programs as never, regionById as never, palette);

    expect(prep.territorySlugs.sort()).toEqual(["shared-one", "shared-three", "shared-two"]);
    expect(prep.programEntries).toHaveLength(3);
    expect(prep.programEntries.map((entry) => entry.programSlug)).toEqual(["alpha", "beta", "gamma"]);
    expect(prep.programEntries[0].territorySlugs).toEqual(["shared-one", "shared-two"]);
    expect(prep.programEntries[1].territorySlugs).toEqual(["shared-two", "shared-three"]);
    expect(prep.programEntries[2].territorySlugs).toEqual(["shared-three"]);
    expect(Object.keys(prep.colorMapping)).toEqual(["prog-alpha", "prog-beta", "prog-gamma"]);
  });
});

