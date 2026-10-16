import { describe, expect, it } from "vitest";
import { requiresPolicyAssent } from "./policies";

describe("requiresPolicyAssent", () => {
  it.each([
    "/explore",
    "/explore/power-plants",
    "/substations",
    "/substations/example",
    "/balancing-authorities/example",
    "/developers",
  ])("gates interactive route %s", (pathname) => expect(requiresPolicyAssent(pathname)).toBe(true));

  it.each(["/", "/about", "/terms", "/acceptable-use", "/privacy", "/sign-in"])(
    "leaves informational route %s accessible",
    (pathname) => expect(requiresPolicyAssent(pathname)).toBe(false)
  );
});
