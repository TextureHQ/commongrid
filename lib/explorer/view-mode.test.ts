import { describe, expect, it } from "vitest";
import { carryViewMode, parseViewMode, resolveViewMode, viewModeToggleAction } from "./view-mode";

describe("resolveViewMode", () => {
  it("defaults the paramless /explore landing state to the map", () => {
    // Regression (reported in #commongrid 2026-08-24): /explore rendered a
    // bare utilities table. The overview root has no list route, and the old
    // fallback read DEFAULT_MODE_FOR_TAB["utilities"] === "table".
    expect(resolveViewMode(null)).toBe("map");
    expect(resolveViewMode(undefined)).toBe("map");
  });

  it("honors the active list route's mode when one exists", () => {
    expect(resolveViewMode("table")).toBe("table");
    expect(resolveViewMode("map")).toBe("map");
  });
});

describe("carryViewMode", () => {
  it("keeps a map user on the map when they switch to a table-default layer", () => {
    // Regression: picking Utilities/Grid Operators/Programs/Rates out of the
    // map's overview panel ejected the user into a full-page table.
    expect(carryViewMode("map")).toBe("map");
  });

  it("keeps a table user in the table when they switch to a map-default layer", () => {
    expect(carryViewMode("table")).toBe("table");
  });

  it("starts on the map when there is no prior projection (overview root)", () => {
    expect(carryViewMode(null)).toBe("map");
  });
});

describe("parseViewMode", () => {
  it("accepts the two valid literals", () => {
    expect(parseViewMode("map")).toBe("map");
    expect(parseViewMode("table")).toBe("table");
  });

  it("rejects anything else so the per-tab default applies", () => {
    expect(parseViewMode(null)).toBeNull();
    expect(parseViewMode("")).toBeNull();
    expect(parseViewMode("MAP")).toBeNull();
    expect(parseViewMode("grid")).toBeNull();
  });
});

describe("viewModeToggleAction", () => {
  it("opens a list route when Table is pressed on the overview root", () => {
    // Regression (reported in #commongrid 2026-08-24): both toggle buttons
    // were inert on /explore. setViewMode early-returned when there was no
    // list route to rewrite — which is precisely the landing state.
    expect(viewModeToggleAction("table", null)).toBe("open-list");
  });

  it("treats Map on the overview root as a no-op (overview IS the map)", () => {
    expect(viewModeToggleAction("map", null)).toBe("noop");
  });

  it("reprojects an existing list route when the requested mode differs", () => {
    expect(viewModeToggleAction("table", "map")).toBe("reproject");
    expect(viewModeToggleAction("map", "table")).toBe("reproject");
  });

  it("is a no-op when the requested mode is already active", () => {
    expect(viewModeToggleAction("map", "map")).toBe("noop");
    expect(viewModeToggleAction("table", "table")).toBe("noop");
  });
});
