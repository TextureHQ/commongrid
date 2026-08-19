import { describe, expect, it } from "vitest";
import { DETAIL_VIEW_TO_TAB, type DetailView, detailViewToTab } from "./detail-view-tab";

describe("detailViewToTab", () => {
  it("maps a utility detail view to the utilities tab", () => {
    // Regression: a program's administrator link opened under tab=programs
    // used to keep tab=programs and render ProgramDetailPanel with a utility
    // slug -> "Program not found".
    expect(detailViewToTab("utility")).toBe("utilities");
  });

  it("maps a program detail view to the programs tab", () => {
    // Regression: a utility's program link used to keep tab=utilities.
    expect(detailViewToTab("program")).toBe("programs");
  });

  it("maps a power-plant detail view to the power-plants tab", () => {
    expect(detailViewToTab("power-plant")).toBe("power-plants");
  });

  it("maps every grid-operator sub-type to the grid-operators tab", () => {
    expect(detailViewToTab("iso")).toBe("grid-operators");
    expect(detailViewToTab("rto")).toBe("grid-operators");
    expect(detailViewToTab("ba")).toBe("grid-operators");
  });

  it("resolves a tab for every DetailView (no undefined lands on a panel)", () => {
    const views: DetailView[] = ["utility", "iso", "rto", "ba", "program", "power-plant"];
    for (const view of views) {
      expect(detailViewToTab(view)).toBeTruthy();
    }
  });

  it("keeps the lookup table and helper in agreement", () => {
    for (const view of Object.keys(DETAIL_VIEW_TO_TAB) as DetailView[]) {
      expect(detailViewToTab(view)).toBe(DETAIL_VIEW_TO_TAB[view]);
    }
  });
});
