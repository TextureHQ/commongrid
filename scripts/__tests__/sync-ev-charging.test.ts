import { describe, expect, it } from "vitest";
import { assertPlausibleStationCount, DEFAULT_BASE_URL, MIN_EXPECTED_STATIONS } from "../sync-ev-charging";

describe("AFDC endpoint host", () => {
  // NREL retired the nrel.gov zone; developer.nrel.gov no longer resolves from
  // anywhere, which failed this sync silently for ~5 months (CIR-1271).
  it("does not point at the dead nrel.gov zone", () => {
    expect(DEFAULT_BASE_URL).not.toContain("nrel.gov");
  });

  it("targets the current developer.nlr.gov alt-fuel-stations endpoint", () => {
    expect(DEFAULT_BASE_URL).toBe("https://developer.nlr.gov/api/alt-fuel-stations/v1.json");
  });
});

describe("assertPlausibleStationCount", () => {
  const existing = (n: number | null) => () => n;

  it("accepts a healthy full-US sync", () => {
    expect(() => assertPlausibleStationCount(89_541, "x", existing(88_000))).not.toThrow();
  });

  it("rejects an empty response instead of clobbering the dataset", () => {
    expect(() => assertPlausibleStationCount(0, "x", existing(89_000))).toThrow(/below the .* minimum/);
  });

  it("rejects a response just under the absolute minimum", () => {
    expect(() => assertPlausibleStationCount(MIN_EXPECTED_STATIONS - 1, "x", existing(null))).toThrow(
      /Refusing to overwrite/
    );
  });

  it("rejects a >50% collapse against what is already on disk", () => {
    expect(() => assertPlausibleStationCount(40_000, "x", existing(89_000))).toThrow(/a >50% drop/);
  });

  it("allows a moderate decline that is not a collapse", () => {
    expect(() => assertPlausibleStationCount(80_000, "x", existing(89_000))).not.toThrow();
  });

  it("passes on first-ever run when no existing file can be read", () => {
    expect(() => assertPlausibleStationCount(89_541, "x", existing(null))).not.toThrow();
  });
});
