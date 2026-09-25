import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { paginatedResponse } from "../../lib/api/response";
import { dbRowToRateStructure } from "../../lib/data/rate-structures";
import { rateStructures } from "../../lib/db/schema/rate-structures";

const root = join(__dirname, "../../app/api/v1");
const spec = JSON.parse(readFileSync(join(__dirname, "../../public/openapi.json"), "utf8"));

// Non-dataset API surfaces intentionally outside the public data reference.
// A new root must be documented or explicitly classified here.
const excludedRoots = new Set([
  "bulk",
  "contributions",
  "dataset-suggestions",
  "developer",
  "discussions",
  "editable-fields",
  "follows",
  "health",
  "me",
  "mod",
  "notifications",
  "tilejson",
  "tiles",
]);

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routes(path) : entry.name === "route.ts" ? [path] : [];
  });
}

const publicRoutes = routes(root).filter((file) => !excludedRoots.has(relative(root, file).split("/")[0]));

describe("public data API documentation", () => {
  for (const file of publicRoutes) {
    const path = `/${relative(root, file)
      .replace(/\/route\.ts$/, "")
      .replace(/\[([^\]]+)\]/g, "{$1}")}`;
    const method = path === "/utilities/resolve" ? "post" : "get";
    it(`documents ${method.toUpperCase()} ${path}`, () => {
      expect(spec.paths[path]?.[method]).toBeDefined();
    });
  }

  it("does not advertise nonexistent public routes", () => {
    const paths = publicRoutes.map(
      (file) =>
        `/${relative(root, file)
          .replace(/\/route\.ts$/, "")
          .replace(/\[([^\]]+)\]/g, "{$1}")}`
    );
    expect(Object.keys(spec.paths).filter((path) => !paths.includes(path))).toEqual([]);
  });

  it("groups every grid operator operation with Grid Operators", () => {
    for (const [path, operations] of Object.entries(spec.paths)) {
      if (/^\/(isos|rtos|balancing-authorities)(\/|$)/.test(path)) {
        expect((operations as { get: { tags: string[] } }).get.tags).toEqual(["Grid Operators"]);
      }
    }
  });

  it("documents the actual pagination envelope", () => {
    const envelope = paginatedResponse([], 0, null, 100);
    const schema = spec.paths["/rates"].get.responses["200"].content["application/json"].schema;
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(envelope).sort());
    expect(Object.keys(spec.components.schemas.Pagination.properties).sort()).toEqual(
      Object.keys(envelope.pagination).sort()
    );
  });

  it("resolves every schema reference", () => {
    for (const match of JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)) {
      expect(spec.components.schemas[match[1]], match[1]).toBeDefined();
    }
  });

  it("documents the curated rate detail shape, not its storage columns", () => {
    const row = Object.fromEntries(Object.keys(getTableColumns(rateStructures)).map((key) => [key, null]));
    const mapped = dbRowToRateStructure({ ...row, id: "rate", slug: "rate", name: "Rate" });
    expect(Object.keys(spec.components.schemas.Rate.properties).sort()).toEqual(Object.keys(mapped).sort());
    expect(spec.components.schemas.Rate.properties.fixedCharge.type).toBe("string");
    expect(spec.components.schemas.RateSummary.properties.energyRateStructure).toBeUndefined();
    expect(spec.components.schemas.RateSummary.properties.energyWeekdaySchedule).toBeUndefined();
    expect(spec.paths["/rates/{slug}"].get.parameters.map((p: { name?: string }) => p.name)).not.toContain("at");
  });
});
