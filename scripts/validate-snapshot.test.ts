import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { spatialLayers, validateGeoJSON, validateSnapshot } from "./validate-snapshot.mjs";

const collection = (geometry: unknown) => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { id: "public-id" }, geometry }],
});
const point = { type: "Point", coordinates: [-73, 44] };
const line = [
  [-73, 44],
  [-72, 45],
];
const ring = [
  [-73, 44],
  [-72, 44],
  [-72, 45],
  [-73, 44],
];
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function snapshot() {
  const directory = mkdtempSync(join(tmpdir(), "snapshot-test-"));
  directories.push(directory);
  for (const layer of spatialLayers)
    writeFileSync(join(directory, `${layer}.geojson.gz`), gzipSync(JSON.stringify(collection(point))));
  for (const name of ["programs", "rates"])
    writeFileSync(join(directory, `${name}.json.gz`), gzipSync(JSON.stringify([{ id: "public-id" }])));
  writeFileSync(
    join(directory, "commongrid-2026-09-30.sql.gz"),
    gzipSync("-- PostgreSQL database dump\nCOPY public.utilities (id) FROM stdin;")
  );
  return directory;
}

describe("snapshot validation", () => {
  it.each([
    point,
    { type: "LineString", coordinates: line },
    { type: "MultiLineString", coordinates: [line] },
    { type: "Polygon", coordinates: [ring] },
    { type: "MultiPolygon", coordinates: [[ring]] },
  ])("accepts $type", (geometry) => expect(validateGeoJSON(collection(geometry))).toBe(1));

  it.each([
    null,
    { type: "Point", coordinates: [null, 44] },
    { type: "Point", coordinates: [181, 44] },
    { type: "Point", coordinates: [-73, 91] },
    { type: "LineString", coordinates: [] },
    { type: "Polygon", coordinates: [line] },
    { type: "Polygon", coordinates: [[...ring.slice(0, -1), [-74, 44]]] },
    { type: "MultiPolygon", coordinates: [] },
    { type: "Unknown", coordinates: line },
  ])("rejects invalid geometry %#", (geometry) => expect(() => validateGeoJSON(collection(geometry))).toThrow());

  it("rejects empty and malformed collections", () => {
    for (const data of [
      {},
      { type: "FeatureCollection", features: [] },
      { ...collection(point), features: [{ geometry: point }] },
    ]) {
      expect(() => validateGeoJSON(data)).toThrow();
    }
  });

  it("checks the complete artifact set", () => expect(() => validateSnapshot(snapshot())).not.toThrow());
  it("fails closed on missing spatial layers", () => {
    const directory = snapshot();
    rmSync(join(directory, "transmission-lines.geojson.gz"));
    expect(() => validateSnapshot(directory)).toThrow("Missing artifact: transmission-lines");
  });
  it("rejects corrupt gzip and JSON instead of publishing it", () => {
    const directory = snapshot();
    writeFileSync(join(directory, "programs.json.gz"), "not gzip");
    expect(() => validateSnapshot(directory)).toThrow();
    writeFileSync(join(directory, "programs.json.gz"), gzipSync("not json"));
    expect(() => validateSnapshot(directory)).toThrow();
  });
  it("rejects empty rates", () => {
    const directory = snapshot();
    writeFileSync(join(directory, "rates.json.gz"), gzipSync("[]"));
    expect(() => validateSnapshot(directory)).toThrow("rates.json.gz");
  });
  it("wires validation before publishing all artifacts", () => {
    const workflow = readFileSync(".github/workflows/weekly-snapshot.yml", "utf8");
    expect(workflow.indexOf("node scripts/validate-snapshot.mjs")).toBeLessThan(workflow.indexOf("gh release upload"));
    expect(workflow.match(/"\$SNAPSHOT_DIR"\/\*\.gz "\$SNAPSHOT_DIR"\/MANIFEST.md/g)).toHaveLength(2);
    expect(workflow).toContain("bash scripts/export-snapshot-layers.sh");
    const exports = readFileSync("scripts/export-snapshot-layers.sh", "utf8");
    for (const table of [
      "transmission_lines",
      "substations",
      "territories",
      "balancing_authorities",
      "isos",
      "rtos",
      "rate_structures",
    ])
      expect(exports).toContain(`FROM ${table}`);
    expect(exports).not.toMatch(/SELECT\s+\*/i);
    expect(exports).not.toMatch(/\b(submitted_by|reviewed_by)\b/);
  });
});
