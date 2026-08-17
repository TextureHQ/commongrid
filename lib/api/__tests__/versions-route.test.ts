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
function findVersionsRoutes(): Array<{
  segment: string;
  entityType: string | null;
  cacheTag: string | null;
  usesFactory: boolean;
}> {
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
        cacheTag: source.match(/cacheTag:\s*"([^"]+)"/)?.[1] ?? null,
        usesFactory: source.includes("createVersionsRoute"),
      };
    })
    .filter((r): r is { segment: string; entityType: string; cacheTag: string; usesFactory: boolean } => r !== null);
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

  // `scripts/openapi/endpoints.ts` is hand-curated, so `openapi:check` compares
  // the generated spec against the committed one — both blind to a route nobody
  // registered. Seven endpoints shipped undocumented with the check passing.
  it.each(routes)("$segment is documented in the OpenAPI spec", ({ segment }) => {
    const spec = JSON.parse(readFileSync(join(process.cwd(), "public/openapi.json"), "utf8"));
    expect(Object.keys(spec.paths)).toContain(`/${segment}/{slug}/versions`);
  });

  it("documents every field the factory returns on EntityVersion", () => {
    const spec = JSON.parse(readFileSync(join(process.cwd(), "public/openapi.json"), "utf8"));
    const documented = Object.keys(spec.components.schemas.EntityVersion.properties);
    // Mirrors the VersionEntry interface in lib/api/versions-route.ts.
    for (const field of [
      "id",
      "versionNumber",
      "changeType",
      "changeSummary",
      "changedBy",
      "changedAt",
      "sourceType",
      "delta",
    ]) {
      expect(documented, `EntityVersion is missing '${field}'`).toContain(field);
    }
  });

  // Cache tags are kebab-case repo-wide; entity_type is snake_case. Defaulting
  // one from the other silently rewrote an existing route's tag, and
  // POST /api/revalidate accepts any string, so stale purges no-op rather than error.
  it.each(routes)("$segment uses a kebab-case cache tag", ({ cacheTag }) => {
    expect(cacheTag).not.toBeNull();
    expect(cacheTag).not.toMatch(/_/);
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
