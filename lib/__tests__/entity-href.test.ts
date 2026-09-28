/**
 * Guard test: every entity kind the changelog can show resolves to a route
 * that exists, or to no link at all.
 *
 * Context: the first pass at clickable changelog entries matched on
 * `"balancing-authority"` while `entity_versions.entity_type` stores
 * `balancing_authority`, and the batch API pointed `utility` at `/utilities/:slug`
 * — a route that has never existed. Between them, the live feed (which is
 * almost entirely `program` and `power_plant` rows) had essentially no working
 * links while appearing to be fixed.
 */

import { describe, expect, it } from "vitest";
import { resolveEntityHref } from "../entity-href";

/**
 * The exact `entity_type` values present in `entity_versions`, as written by
 * the sync jobs. Snake_case, and the only spelling the database ever produces.
 */
const DB_ENTITY_TYPES = [
  "utility",
  "iso",
  "rto",
  "balancing_authority",
  "power_plant",
  "ev_station",
  "pricing_node",
  "program",
  "transmission_line",
  "territory",
  "region",
] as const;

describe("resolveEntityHref", () => {
  it("resolves every entity type the changelog feed can emit", () => {
    // Territories and regions are map geometry with no detail page; everything
    // else must produce a link, or the feed silently degrades to plain text.
    const unlinkable = new Set(["territory", "region"]);

    for (const type of DB_ENTITY_TYPES) {
      const href = resolveEntityHref(type, "some-slug");
      if (unlinkable.has(type)) {
        expect(href, `${type} should not be linkable`).toBeNull();
      } else {
        expect(href, `${type} should resolve to a detail page`).not.toBeNull();
      }
    }
  });

  it("points each kind at the route that actually serves it", () => {
    // Verified by hand against app/(shell)/*. `/grid-operators/[slug]` calls
    // useUtility() and 404s for anything else, so ISOs and RTOs go to Explore.
    expect(resolveEntityHref("utility", "alabama-power")).toBe("/grid-operators/alabama-power");
    expect(resolveEntityHref("iso", "caiso")).toBe("/explore/grid-operators/caiso");
    expect(resolveEntityHref("rto", "pjm")).toBe("/explore/grid-operators/pjm");
    expect(resolveEntityHref("balancing_authority", "miso")).toBe("/balancing-authorities/miso");
    expect(resolveEntityHref("power_plant", "59th-street-ny")).toBe("/power-plants/59th-street-ny");
    expect(resolveEntityHref("ev_station", "station-1")).toBe("/ev-charging/station-1");
    expect(resolveEntityHref("pricing_node", "node-1")).toBe("/pricing-nodes/node-1");
    expect(resolveEntityHref("program", "beat-the-peak-15")).toBe("/explore/programs/beat-the-peak-15");
  });

  it("never emits a route that does not exist", () => {
    // The precise dead links the batch API used to build.
    const hrefs = DB_ENTITY_TYPES.map((t) => resolveEntityHref(t, "x")).filter((h): h is string => h !== null);

    for (const href of hrefs) {
      expect(href).not.toMatch(/^\/utilities\//);
      expect(href).not.toMatch(/^\/isos\//);
      expect(href).not.toMatch(/^\/rtos\//);
      expect(href).not.toMatch(/^\/regions\//);
      expect(href).not.toMatch(/^\/ev-stations\//);
      expect(href).not.toMatch(/^\/programs\//);
    }
  });

  it("accepts the kebab-case spelling used by types/changelog.ts", () => {
    // The static changelog.json fallback and the DB feed disagree on spelling;
    // a link must not depend on which one served the request.
    expect(resolveEntityHref("balancing-authority", "miso")).toBe(resolveEntityHref("balancing_authority", "miso"));
    expect(resolveEntityHref("power-plant", "x")).toBe(resolveEntityHref("power_plant", "x"));
    expect(resolveEntityHref("ev-station", "x")).toBe(resolveEntityHref("ev_station", "x"));
    expect(resolveEntityHref("pricing-node", "x")).toBe(resolveEntityHref("pricing_node", "x"));
  });

  it("returns null rather than guessing", () => {
    expect(resolveEntityHref("utility", null)).toBeNull();
    expect(resolveEntityHref("utility", "")).toBeNull();
    expect(resolveEntityHref("something_new", "x")).toBeNull();
  });
});
