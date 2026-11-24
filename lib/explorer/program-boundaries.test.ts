import { describe, expect, it } from "vitest";
import { collectProgramTerritorySlugs } from "./program-boundaries";

describe("collectProgramTerritorySlugs", () => {
  it("dedupes only within one program, not across programs", () => {
    const regionById = new Map([
      ["r1", { slug: "shared-territory" }],
      ["r2", { slug: "unique-territory" }],
      ["r3", { slug: "shared-territory" }],
      ["r4", { slug: null }],
    ]);

    expect(collectProgramTerritorySlugs(["r1", "r2", "r3", "r4"], regionById)).toEqual([
      "shared-territory",
      "unique-territory",
    ]);
    expect(collectProgramTerritorySlugs(["r3", "r1"], regionById)).toEqual(["shared-territory"]);
  });
});
