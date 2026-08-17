/**
 * Ties the entityType -> API segment map to the routes that actually exist.
 *
 * Three naming systems are in play (entity_type, API segment, UI route) and none
 * derives cleanly from another. VersionHistory built URLs by appending "s",
 * which produced `utilitys` and left the underscore in every multi-word type —
 * working for four of nine and 404ing on the rest. These assertions make that
 * class of drift fail in CI instead of in the browser.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apiSegmentFor, ENTITY_API_SEGMENTS, entityTypeForApiSegment, versionsPath } from "@/lib/entity-routes";

describe("entity route map", () => {
  const entries = Object.entries(ENTITY_API_SEGMENTS);

  it.each(entries)("%s -> %s has a versions route on disk", (_entityType, segment) => {
    expect(existsSync(join(process.cwd(), "app/api/v1", segment, "[slug]", "versions", "route.ts"))).toBe(true);
  });

  it.each(entries)("%s route declares the same entity type the map claims", (entityType, segment) => {
    const source = readFileSync(join(process.cwd(), "app/api/v1", segment, "[slug]", "versions", "route.ts"), "utf8");
    expect(source).toContain(`entityType: "${entityType}"`);
  });

  it.each(entries)("entityTypeForApiSegment(%s) reverses the map", (entityType, segment) => {
    expect(entityTypeForApiSegment(segment)).toBe(entityType);
  });

  it("would have caught the naive-pluralisation bug", () => {
    // `${entityType}s` for each of these produced a URL that does not exist.
    for (const entityType of ["utility", "power_plant", "ev_station", "pricing_node", "balancing_authority"]) {
      expect(apiSegmentFor(entityType)).not.toBe(`${entityType}s`);
    }
  });

  it("returns null for id-keyed types rather than a wrong URL", () => {
    expect(apiSegmentFor("territory")).toBeNull();
    expect(apiSegmentFor("transmission_line")).toBeNull();
    expect(versionsPath("territory", "anything")).toBeNull();
  });

  it("escapes slugs", () => {
    expect(versionsPath("utility", "a b/c")).toBe("/api/v1/utilities/a%20b%2Fc/versions");
  });
});
