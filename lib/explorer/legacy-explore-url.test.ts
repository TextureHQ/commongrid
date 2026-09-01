import { describe, expect, it } from "vitest";
import { legacyExploreRedirect } from "./legacy-explore-url";

function redirect(url: string): string | null {
  const [pathname, query = ""] = url.split("?");
  return legacyExploreRedirect(pathname, new URLSearchParams(query));
}

describe("legacyExploreRedirect", () => {
  it("tab + slug → /explore/:tab/:slug", () => {
    expect(redirect("/explore?tab=programs&slug=banana")).toBe("/explore/programs/banana");
  });

  it("view alias behaves like tab", () => {
    expect(redirect("/explore?view=utilities&slug=vermont-electric-cooperative")).toBe(
      "/explore/utilities/vermont-electric-cooperative"
    );
  });

  it("tab only → /explore/:tab", () => {
    expect(redirect("/explore?tab=grid-operators")).toBe("/explore/grid-operators");
  });

  it("drops mode=map (map is the default)", () => {
    expect(redirect("/explore?tab=power-plants&mode=map")).toBe("/explore/power-plants");
  });

  it("preserves mode=table", () => {
    expect(redirect("/explore?tab=utilities&mode=table")).toBe("/explore/utilities?mode=table");
  });

  it("preserves q and mode=table together", () => {
    expect(redirect("/explore?tab=utilities&mode=table&q=vermont")).toBe("/explore/utilities?mode=table&q=vermont");
  });

  it("preserves list filters (segment/type/jurisdictions)", () => {
    expect(redirect("/explore?tab=utilities&segment=INVESTOR_OWNED_UTILITY&jurisdictions=CA,NY")).toBe(
      "/explore/utilities?segment=INVESTOR_OWNED_UTILITY&jurisdictions=CA%2CNY"
    );
  });

  it("drops q= when empty", () => {
    expect(redirect("/explore?tab=programs&q=")).toBe("/explore/programs");
  });

  it("legacy grid-operator detail views collapse to the grid-operators tab", () => {
    expect(redirect("/explore?view=iso&slug=iso-ne")).toBe("/explore/grid-operators/iso-ne");
    expect(redirect("/explore?view=rto&slug=pjm")).toBe("/explore/grid-operators/pjm");
    expect(redirect("/explore?view=ba&slug=caiso")).toBe("/explore/grid-operators/caiso");
  });

  it("lossy program-under-utility legacy link degrades to the direct program view", () => {
    // Old scheme could not encode nesting; a program opened under a utility
    // was `tab=utilities&slug=<programSlug>`. We can only trust the tab we are
    // given, so this maps to /explore/utilities/<slug> — the honest best we
    // can do without inventing a parent. (Real program bookmarks used
    // tab=programs and map correctly; see the first test.)
    expect(redirect("/explore?tab=programs&slug=flexible-load-2")).toBe("/explore/programs/flexible-load-2");
  });

  it("encodes reserved characters in the slug", () => {
    expect(redirect("/explore?tab=utilities&slug=pg%26e")).toBe("/explore/utilities/pg%26e");
  });

  it("returns null for a bare /explore (already canonical)", () => {
    expect(redirect("/explore")).toBeNull();
  });

  it("returns null for an unrecognized tab", () => {
    expect(redirect("/explore?tab=not-a-tab&slug=x")).toBeNull();
  });

  it("does not rewrite new path routes (no loop)", () => {
    expect(redirect("/explore/utilities")).toBeNull();
    expect(redirect("/explore/programs/banana")).toBeNull();
    expect(redirect("/explore/utilities/vec/programs/beat-the-peak-37")).toBeNull();
  });

  it("does not rewrite a new path route even if it carries view options", () => {
    expect(redirect("/explore/utilities?mode=table&q=vermont")).toBeNull();
  });
});
