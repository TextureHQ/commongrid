/**
 * Tests for server-side enum validation on contribution submit (CIR-1506).
 */

import { describe, expect, it } from "vitest";
import { describeInvalidEnumValue, findInvalidEnumValues } from "@/lib/community-editable-fields/validate-enum-values";
import { ProgramStatus } from "@/types/programs";

describe("findInvalidEnumValues", () => {
  it("accepts a valid uppercase program status", () => {
    expect(findInvalidEnumValues("program", { status: { old: "ACTIVE", new: ProgramStatus.PAUSED } })).toEqual([]);
  });

  it("rejects the exact value that caused the production drift", () => {
    const invalid = findInvalidEnumValues("program", { status: { old: null, new: "active" } });

    expect(invalid).toHaveLength(1);
    expect(invalid[0].field).toBe("status");
    expect(invalid[0].value).toBe("active");
    expect(invalid[0].caseMismatchOf).toBe("ACTIVE");
  });

  it("rejects values that are not enum members at all", () => {
    const invalid = findInvalidEnumValues("program", { status: { old: null, new: "enrolling" } });

    expect(invalid).toHaveLength(1);
    expect(invalid[0].caseMismatchOf).toBeUndefined();
    expect(invalid[0].allowed).toContain("ACTIVE");
  });

  it("handles the flat { field: value } shape", () => {
    expect(findInvalidEnumValues("program", { status: "active" })).toHaveLength(1);
    expect(findInvalidEnumValues("program", { status: "ARCHIVED" })).toEqual([]);
  });

  it("validates utility segment and status", () => {
    expect(findInvalidEnumValues("utility", { segment: "cooperative" })).toHaveLength(1);
    expect(findInvalidEnumValues("utility", { segment: "DISTRIBUTION_COOPERATIVE" })).toEqual([]);
    expect(findInvalidEnumValues("utility", { status: "inactive" })).toHaveLength(1);
    expect(findInvalidEnumValues("utility", { status: "ACTIVE" })).toEqual([]);
  });

  it("keeps lowercase power_plant status valid", () => {
    // This domain is genuinely lowercase; uppercasing it would be the bug.
    expect(findInvalidEnumValues("power_plant", { status: "operable" })).toEqual([]);
    expect(findInvalidEnumValues("power_plant", { status: "OPERABLE" })).toHaveLength(1);
  });

  it("ignores non-enum fields and cleared values", () => {
    expect(findInvalidEnumValues("program", { name: "Anything At All" })).toEqual([]);
    expect(findInvalidEnumValues("program", { status: { old: "ACTIVE", new: null } })).toEqual([]);
    expect(findInvalidEnumValues("program", { status: "" })).toEqual([]);
  });

  it("ignores fields whose options come from an external source", () => {
    // ev_station.state has an enumSource and no inline list, so it is not
    // checked here rather than being rejected outright.
    expect(findInvalidEnumValues("ev_station", { state: "NY" })).toEqual([]);
  });

  it("reports every invalid field, not just the first", () => {
    const invalid = findInvalidEnumValues("utility", { segment: "cooperative", status: "inactive", name: "Fine" });
    expect(invalid.map((i) => i.field).sort()).toEqual(["segment", "status"]);
  });
});

describe("describeInvalidEnumValue", () => {
  it("calls out case-sensitivity when that is the problem", () => {
    const [invalid] = findInvalidEnumValues("program", { status: "active" });
    expect(describeInvalidEnumValue(invalid)).toBe(
      'status must be "ACTIVE", not "active" (values are case-sensitive).'
    );
  });

  it("lists the allowed values otherwise", () => {
    const [invalid] = findInvalidEnumValues("program", { status: "enrolling" });
    expect(describeInvalidEnumValue(invalid)).toContain("must be one of:");
    expect(describeInvalidEnumValue(invalid)).toContain("ACTIVE");
  });
});
