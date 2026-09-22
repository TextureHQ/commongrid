import { describe, expect, it } from "vitest";
import {
  buildUtilityLookups,
  diceCoefficient,
  NAME_MATCH_THRESHOLD,
  normalizeName,
  type ResolverUtility,
  resolveUtilityId,
} from "../resolve-entity";

const UTILITIES: ResolverUtility[] = [
  { id: "util-alabama-power", name: "Alabama Power Company", eiaId: "195", baCode: "SOCO", state: "AL" },
  { id: "util-aiken", name: "Aiken Electric Cooperative, Inc", eiaId: "162", baCode: "SC", state: "SC" },
  // Two utilities share a (baCode, state) pair, making it ambiguous on purpose.
  { id: "util-ny-one", name: "Consolidated Edison Co-NY Inc", eiaId: "4226", baCode: "NYIS", state: "NY" },
  { id: "util-ny-two", name: "David Energy Supply LLC", eiaId: "66867", baCode: "NYIS", state: "NY" },
  // Unique BA+state pair usable for the ba_state path.
  { id: "util-desert", name: "Desert Community Energy", eiaId: "64195", baCode: "CISO", state: "CA" },
];

const LOOKUPS = buildUtilityLookups(UTILITIES);

describe("resolveUtilityId", () => {
  it("(1) matches on exact EIA id, accepting numeric or string input", () => {
    expect(resolveUtilityId({ eiaId: "195" }, LOOKUPS)).toEqual({
      utilityId: "util-alabama-power",
      method: "eia_id",
    });
    expect(resolveUtilityId({ eiaId: 162 }, LOOKUPS)).toEqual({
      utilityId: "util-aiken",
      method: "eia_id",
    });
  });

  it("(1) eia_id wins even when name/ba are also present", () => {
    const res = resolveUtilityId(
      { eiaId: "195", baCode: "NYIS", state: "NY", name: "Totally Different Name" },
      LOOKUPS
    );
    expect(res).toEqual({ utilityId: "util-alabama-power", method: "eia_id" });
  });

  it("(2) matches on baCode + state when that pair is unambiguous", () => {
    const res = resolveUtilityId({ eiaId: "999999", baCode: "CISO", state: "CA" }, LOOKUPS);
    expect(res).toEqual({ utilityId: "util-desert", method: "ba_state" });
  });

  it("(2) is case-insensitive on baCode + state", () => {
    const res = resolveUtilityId({ baCode: "ciso", state: "ca" }, LOOKUPS);
    expect(res).toEqual({ utilityId: "util-desert", method: "ba_state" });
  });

  it("(2) does NOT match on an ambiguous baCode + state (falls through)", () => {
    // NYIS+NY maps to two utilities; with no name we cannot disambiguate.
    const res = resolveUtilityId({ baCode: "NYIS", state: "NY" }, LOOKUPS);
    expect(res).toEqual({ utilityId: null, method: "unresolved" });
  });

  it("(3) matches on fuzzy name (corporate-form drift) above threshold", () => {
    // "Alabama Power Co" vs stored "Alabama Power Company" — no eia/ba signal.
    const res = resolveUtilityId({ name: "Alabama Power Co" }, LOOKUPS);
    expect(res).toEqual({ utilityId: "util-alabama-power", method: "name_trgm" });
  });

  it("(3) matches on exact-normalized name via the fast path", () => {
    const res = resolveUtilityId({ name: "ALABAMA POWER COMPANY" }, LOOKUPS);
    expect(res).toEqual({ utilityId: "util-alabama-power", method: "name_trgm" });
  });

  it("(4) returns unresolved when nothing matches confidently", () => {
    expect(resolveUtilityId({ name: "Nonexistent Widget Factory" }, LOOKUPS)).toEqual({
      utilityId: null,
      method: "unresolved",
    });
    expect(resolveUtilityId({}, LOOKUPS)).toEqual({ utilityId: null, method: "unresolved" });
    expect(resolveUtilityId({ eiaId: "does-not-exist" }, LOOKUPS)).toEqual({
      utilityId: null,
      method: "unresolved",
    });
  });

  it("falls through eia_id → ba_state → name in order", () => {
    // eia miss, ba unique hit takes precedence over any name scan.
    const res = resolveUtilityId(
      { eiaId: "0", baCode: "CISO", state: "CA", name: "Aiken Electric Cooperative" },
      LOOKUPS
    );
    expect(res.method).toBe("ba_state");
    expect(res.utilityId).toBe("util-desert");
  });
});

describe("buildUtilityLookups", () => {
  it("indexes by eiaId with first-writer-wins determinism", () => {
    const dupes: ResolverUtility[] = [
      { id: "first", name: "A", eiaId: "10" },
      { id: "second", name: "B", eiaId: "10" },
    ];
    const lk = buildUtilityLookups(dupes);
    expect(lk.byEiaId.get("10")).toBe("first");
  });

  it("collects multiple candidates for a shared baCode+state", () => {
    expect(LOOKUPS.byBaState.get("NYIS|NY")?.size).toBe(2);
    expect(LOOKUPS.byBaState.get("CISO|CA")?.size).toBe(1);
  });

  it("skips utilities with no eiaId/ba/name signals gracefully", () => {
    const lk = buildUtilityLookups([{ id: "x", name: "", eiaId: null, baCode: null }]);
    expect(lk.byEiaId.size).toBe(0);
    expect(lk.byBaState.size).toBe(0);
    expect(lk.nameIndex.length).toBe(0);
  });
});

describe("normalizeName", () => {
  it("lowercases, strips punctuation, and folds corporate forms", () => {
    expect(normalizeName("Alabama Power Company")).toBe("alabama power co");
    expect(normalizeName("Aiken Electric Cooperative, Inc.")).toBe("aiken elec coop inc");
    expect(normalizeName("Smith & Sons Utilities")).toBe("smith and sons util");
  });

  it("returns empty string for nullish/blank input", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("diceCoefficient", () => {
  it("scores identical strings 1 and disjoint strings 0", () => {
    expect(diceCoefficient("abcd", "abcd")).toBe(1);
    expect(diceCoefficient("abcd", "wxyz")).toBe(0);
  });

  it("scores close variants above the match threshold", () => {
    expect(diceCoefficient("alabama power co", "alabama power co")).toBeGreaterThanOrEqual(NAME_MATCH_THRESHOLD);
  });

  it("handles too-short strings without throwing", () => {
    expect(diceCoefficient("a", "b")).toBe(0);
    expect(diceCoefficient("", "")).toBe(0);
  });
});
