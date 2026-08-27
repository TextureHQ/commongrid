import { describe, expect, it } from "vitest";
import {
  buildNewProgramHref,
  NEW_PROGRAM_PATH,
  NEW_PROGRAM_UTILITY_PARAM,
  parseNewProgramUtilityParam,
} from "./new-program-link";

describe("buildNewProgramHref", () => {
  it("preselects the utility as a query parameter", () => {
    expect(buildNewProgramHref("vermont-electric-cooperative")).toBe(
      `${NEW_PROGRAM_PATH}?${NEW_PROGRAM_UTILITY_PARAM}=vermont-electric-cooperative`
    );
  });

  it("falls back to the bare form when no utility is given", () => {
    expect(buildNewProgramHref()).toBe(NEW_PROGRAM_PATH);
    expect(buildNewProgramHref(null)).toBe(NEW_PROGRAM_PATH);
    expect(buildNewProgramHref("")).toBe(NEW_PROGRAM_PATH);
    expect(buildNewProgramHref("   ")).toBe(NEW_PROGRAM_PATH);
  });

  it("drops values that cannot be a slug rather than emitting a broken link", () => {
    // A value carrying its own query syntax must not be able to append params.
    expect(buildNewProgramHref("foo&utility=bar")).toBe(NEW_PROGRAM_PATH);
    expect(buildNewProgramHref("../../etc/passwd")).toBe(NEW_PROGRAM_PATH);
    expect(buildNewProgramHref("has space")).toBe(NEW_PROGRAM_PATH);
  });

  it("round-trips through the parser", () => {
    const slug = "central-georgia-el-member";
    const href = buildNewProgramHref(slug);
    const query = new URL(href, "https://commongrid.info").searchParams;
    expect(parseNewProgramUtilityParam(query.get(NEW_PROGRAM_UTILITY_PARAM))).toBe(slug);
  });
});

describe("parseNewProgramUtilityParam", () => {
  it("returns the slug when the parameter is present", () => {
    expect(parseNewProgramUtilityParam("vermont-electric-cooperative")).toBe("vermont-electric-cooperative");
  });

  it("returns the picker's empty-selection value when absent or unusable", () => {
    // "" is what UtilityAutocomplete treats as "nothing selected", so the form
    // renders an empty field instead of requesting a utility that cannot exist.
    expect(parseNewProgramUtilityParam(null)).toBe("");
    expect(parseNewProgramUtilityParam(undefined)).toBe("");
    expect(parseNewProgramUtilityParam("")).toBe("");
    expect(parseNewProgramUtilityParam("not a slug!")).toBe("");
  });

  it("tolerates surrounding whitespace from hand-edited URLs", () => {
    expect(parseNewProgramUtilityParam("  duke-energy-carolinas  ")).toBe("duke-energy-carolinas");
  });
});
