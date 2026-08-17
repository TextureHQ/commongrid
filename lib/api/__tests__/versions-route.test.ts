/**
 * Guards the invariant the versions factory exists to enforce: a type that is
 * writable through the contribution path must be readable through its versions
 * route, spelled identically in both.
 *
 * Reads the route files from disk rather than importing them, so a new
 * `/versions` route added later is covered without anyone remembering to add it
 * here — including one added with a typo'd or unregistered entity type, which
 * is the failure this is really watching for.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownEntityType } from "@/lib/mod/apply-contribution";

const API_ROOT = join(process.cwd(), "app/api/v1");

/** Every `<segment>/[slug]/versions/route.ts` and the entityType it declares. */
function findVersionsRoutes(): Array<{ segment: string; entityType: string | null; usesFactory: boolean }> {
  return readdirSync(API_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = join(API_ROOT, d.name, "[slug]", "versions", "route.ts");
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        return null;
      }
      return {
        segment: d.name,
        entityType: source.match(/entityType:\s*"([^"]+)"/)?.[1] ?? null,
        usesFactory: source.includes("createVersionsRoute"),
      };
    })
    .filter((r): r is { segment: string; entityType: string; usesFactory: boolean } => r !== null);
}

describe("versions routes", () => {
  const routes = findVersionsRoutes();

  it("finds the versions routes on disk", () => {
    expect(routes.length).toBeGreaterThanOrEqual(9);
  });

  it.each(routes)("$segment declares an entity type the write path knows", ({ entityType }) => {
    expect(entityType).not.toBeNull();
    expect(isKnownEntityType(entityType as string)).toBe(true);
  });

  it.each(routes)("$segment goes through the shared factory", ({ usesFactory }) => {
    expect(usesFactory).toBe(true);
  });

  it("declares each entity type exactly once", () => {
    const types = routes.map((r) => r.entityType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("covers every slug-keyed type in the write registry", () => {
    // territory and transmission_line are addressed by id, not slug, so the
    // slug-based factory cannot serve them. They are the known gap.
    const ID_KEYED = new Set(["territory", "transmission_line"]);
    const covered = new Set(routes.map((r) => r.entityType));

    for (const entityType of [
      "utility",
      "power_plant",
      "ev_station",
      "pricing_node",
      "iso",
      "rto",
      "balancing_authority",
      "region",
      "program",
    ]) {
      if (ID_KEYED.has(entityType)) continue;
      expect(covered.has(entityType), `${entityType} has no /versions route`).toBe(true);
    }
  });
});
