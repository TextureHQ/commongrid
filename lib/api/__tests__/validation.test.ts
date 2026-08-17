/**
 * Unit tests for query-param validation helpers used by public list routes:
 * enum filters that must 400 instead of returning silent empty lists.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { parseEnumFilterParam, UTILITY_SEGMENT_VALUES, UTILITY_STATUS_VALUES } from "@/lib/api/validation";

describe("parseEnumFilterParam", () => {
  it("returns null when param is absent or blank", () => {
    expect(parseEnumFilterParam(null, UTILITY_SEGMENT_VALUES, "segment")).toBeNull();
    expect(parseEnumFilterParam("  ", UTILITY_SEGMENT_VALUES, "segment")).toBeNull();
  });

  it("accepts a single valid UtilitySegment", () => {
    expect(parseEnumFilterParam("INVESTOR_OWNED_UTILITY", UTILITY_SEGMENT_VALUES, "segment")).toEqual([
      "INVESTOR_OWNED_UTILITY",
    ]);
  });

  it("accepts comma-separated valid values", () => {
    expect(parseEnumFilterParam("ACTIVE,MERGED", UTILITY_STATUS_VALUES, "status")).toEqual(["ACTIVE", "MERGED"]);
  });

  it("rejects lowercase / alias segment values with allowed list", () => {
    try {
      parseEnumFilterParam("cooperative", UTILITY_SEGMENT_VALUES, "segment");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.code).toBe("VALIDATION_ERROR");
      expect(e.message).toContain("INVESTOR_OWNED_UTILITY");
      expect(e.details).toMatchObject({ field: "segment", invalid: ["cooperative"] });
    }
  });

  it("rejects lowercase status values", () => {
    expect(() => parseEnumFilterParam("active", UTILITY_STATUS_VALUES, "status")).toThrow(ApiError);
  });
});
