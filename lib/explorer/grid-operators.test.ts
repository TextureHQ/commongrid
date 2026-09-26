import { describe, expect, it } from "vitest";
import { formatGridOperatorStates, gridOperatorKey } from "./grid-operators";

describe("gridOperatorKey", () => {
  it("distinguishes an ISO from the balancing authority sharing its slug", () => {
    // caiso, ercot, iso-ne, miso and nyiso each appear twice in the operator
    // list — once as an ISO, once as a BA — so slug alone is ambiguous.
    expect(gridOperatorKey("iso", "caiso")).not.toBe(gridOperatorKey("ba", "caiso"));
  });

  it("is stable for the same kind and slug", () => {
    expect(gridOperatorKey("ba", "miso")).toBe(gridOperatorKey("ba", "miso"));
    expect(gridOperatorKey("ba", "miso")).toBe("ba:miso");
  });
});

describe("formatGridOperatorStates", () => {
  it("lists up to three states", () => {
    expect(formatGridOperatorStates(["AZ", "CA", "NV"])).toBe("AZ, CA, NV");
  });

  it("summarizes the rest past three", () => {
    expect(formatGridOperatorStates(["IA", "IL", "IN", "MI", "MN"])).toBe("IA, IL, IN +2");
  });

  it("handles one state and none at all", () => {
    expect(formatGridOperatorStates(["TX"])).toBe("TX");
    expect(formatGridOperatorStates([])).toBe("");
  });
});
