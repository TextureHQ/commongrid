import { describe, expect, it } from "vitest";
import { isMapRegion, MAP_REGIONS, type MapRegion, regionToTab } from "./region-navigation";

describe("region-navigation", () => {
  it("exposes exactly the map's fill-layer regions", () => {
    expect([...MAP_REGIONS]).toEqual(["utilities", "grid-operators", "programs", "rates", "pricing-nodes"]);
  });

  it("resolves every region to a navigable tab (identity contract)", () => {
    for (const region of MAP_REGIONS) {
      expect(regionToTab(region)).toBe(region);
    }
  });

  it("resolves the Programs region a real reporter hit (CG-259) to the programs tab", () => {
    // Cyril: selecting Programs in the region dropdown did nothing but refresh.
    // The fix routes it through navigateToTab; the tab it must land on is
    // `programs`, not the current route's tab.
    expect(regionToTab("programs")).toBe("programs");
  });

  it("accepts the valid regions and rejects non-region tabs", () => {
    for (const region of MAP_REGIONS) {
      expect(isMapRegion(region)).toBe(true);
    }
    // Overlay-only / point-line entity tabs are not fill regions.
    for (const notRegion of ["power-plants", "transmission-lines", "ev-charging", "substations", "", "bogus"]) {
      expect(isMapRegion(notRegion)).toBe(false);
    }
  });

  it("keeps the region union aligned with the exported list", () => {
    // Compile-time-ish guard: every literal in the union appears in MAP_REGIONS.
    const regions: MapRegion[] = ["utilities", "grid-operators", "programs", "rates", "pricing-nodes"];
    expect(new Set(regions)).toEqual(new Set(MAP_REGIONS));
  });
});
