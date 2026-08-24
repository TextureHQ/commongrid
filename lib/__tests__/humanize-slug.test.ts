/**
 * Tests for humanizeSlug() — the display fallback used when an entity slug
 * referenced by another record can't be resolved to a real row.
 *
 * The UI must never render an empty utility field for a program that has an
 * administrator; a humanized slug is the floor.
 */

import { describe, expect, it } from "vitest";

import { humanizeSlug, slugify } from "@/lib/slugify";

describe("humanizeSlug", () => {
  it("title-cases a hyphenated utility slug", () => {
    expect(humanizeSlug("central-georgia-el-member")).toBe("Central Georgia El Member");
  });

  it("handles underscores and repeated separators", () => {
    expect(humanizeSlug("oconto_electric--cooperative")).toBe("Oconto Electric Cooperative");
  });

  it("upper-cases known acronyms", () => {
    expect(humanizeSlug("snohomish-county-pud")).toBe("Snohomish County PUD");
    expect(humanizeSlug("some-utility-llc")).toBe("Some Utility LLC");
    expect(humanizeSlug("central-georgia-emc")).toBe("Central Georgia EMC");
  });

  it("normalizes existing casing rather than preserving it", () => {
    expect(humanizeSlug("Central-GEORGIA-El-Member")).toBe("Central Georgia El Member");
  });

  it("returns the original input when there is nothing to humanize", () => {
    expect(humanizeSlug("")).toBe("");
    expect(humanizeSlug("---")).toBe("---");
  });

  it("round-trips a simple name through slugify", () => {
    expect(humanizeSlug(slugify("Oconto Electric Cooperative"))).toBe("Oconto Electric Cooperative");
  });
});
