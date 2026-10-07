import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { spatialLayers, validateGeoJSON } from "../validate-snapshot.mjs";

// Disposable local/CI PostGIS only. Never use DATABASE_URL here.
const url = process.env.SNAPSHOT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("snapshot SQL against current schema (PostGIS)", () => {
  const pool = new Pool({ connectionString: url });
  const directory = mkdtempSync(join(tmpdir(), "snapshot-postgis-"));
  const namespace = `snapshot_test_${process.pid}`;
  const tables: PgTable[] = [
    schema.utilities,
    schema.regions,
    schema.territories,
    schema.evStations,
    schema.powerPlants,
    schema.pricingNodes,
    schema.programs,
    schema.transmissionLines,
    schema.substations,
    schema.balancingAuthorities,
    schema.isos,
    schema.rtos,
    schema.rateStructures,
  ];

  beforeAll(async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      !["/snapshot_test", "/boundary_test"].includes(new URL(url).pathname)
    ) {
      throw new Error("Use a disposable local snapshot_test/boundary_test database");
    }
    await pool.query(`CREATE SCHEMA ${namespace}`);
    // Current Drizzle names/types, not a hand-maintained copy of the schema.
    // No FK/not-null constraints: fixtures intentionally fill only public projections.
    for (const table of tables) {
      const config = getTableConfig(table);
      const columns = config.columns.map((column) => `"${column.name}" ${column.getSQLType()}`).join(", ");
      await pool.query(`CREATE TABLE ${namespace}.${config.name} (${columns})`);
    }
    await pool.query(`
      SET search_path TO ${namespace}, public;
      INSERT INTO regions (id, name, type) VALUES ('region', 'Test region', 'STATE');
      INSERT INTO territories (id, region_id, geography, source) VALUES
        ('territory', 'region', ST_GeogFromText('SRID=4326;MULTIPOLYGON(((-73 44,-72 44,-72 45,-73 44)))'), 'fixture');
      INSERT INTO utilities (id, name, service_territory_id) VALUES ('utility', 'Test utility', 'region');
      INSERT INTO transmission_lines (id, geometry, source) VALUES
        ('line', ST_GeomFromText('MULTILINESTRING((-73 44,-72 45))',4326), 'fixture'),
        ('missing-geometry', NULL, 'fixture');
      INSERT INTO transmission_lines (id, geometry, deleted_at) VALUES
        ('deleted-line', ST_GeomFromText('MULTILINESTRING((-73 44,-72 45))',4326), NOW());
      INSERT INTO ev_stations (id, longitude, latitude) VALUES ('station',-73,44), ('bad-position',-73,95);
      INSERT INTO power_plants (id, longitude, latitude) VALUES ('plant',-73,44);
      INSERT INTO pricing_nodes (id, longitude, latitude) VALUES ('node',-73,44);
      INSERT INTO substations (id, longitude, latitude) VALUES ('substation',-73,44);
      INSERT INTO balancing_authorities (id, region_id) VALUES ('ba','region');
      INSERT INTO isos (id, region_id) VALUES ('iso','region');
      INSERT INTO rtos (id, region_id) VALUES ('rto','region');
      INSERT INTO programs (id, name, organizations, source) VALUES
        ('program','Test program','[{"id":"utility","role":"UTILITY"}]','fixture');
      INSERT INTO rate_structures (id, utility_id, region_id, attribution, submitted_by) VALUES
        ('rate','utility','region','{"name":"Fixture attribution"}','private-user');
    `);
  });

  afterAll(async () => {
    if (url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
      await pool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    }
    await pool.end();
    rmSync(directory, { recursive: true, force: true });
  });

  it("executes every export, preserves joins/provenance and excludes invalid/deleted/private data", () => {
    const workflow = readFileSync(".github/workflows/weekly-snapshot.yml", "utf8");
    const env = {
      ...process.env,
      DATABASE_URL: url,
      SNAPSHOT_DIR: directory,
      BASH_ENV: "",
      PGOPTIONS: `-c search_path=${namespace},public`,
    };
    for (const step of workflow.split("      - name: ")) {
      if (!step.startsWith("Export GeoJSON") && !step.startsWith("Export JSON")) continue;
      const match = step.match(/ {8}run: \|\n([\s\S]*?)(?=\n {6}[^ ]|$)/);
      if (!match) throw new Error("Missing export script");
      const script = match[1]
        .split("\n")
        .map((line) => line.replace(/^ {10}/, ""))
        .join("\n");
      execFileSync("bash", ["-euo", "pipefail", "-c", script], { env });
    }
    execFileSync("bash", ["scripts/export-snapshot-layers.sh"], { env });
    const read = (name: string) => JSON.parse(gunzipSync(readFileSync(join(directory, name))).toString());
    for (const layer of spatialLayers) {
      expect(validateGeoJSON(read(`${layer}.geojson.gz`), { allowNullGeometry: layer === "transmission-lines" })).toBe(
        layer === "transmission-lines" ? 2 : 1
      );
    }
    expect(
      read("transmission-lines.geojson.gz").features.find((f: { id: string }) => f.id === "line").geometry.type
    ).toBe("MultiLineString");
    expect(
      read("transmission-lines.geojson.gz").features.find((f: { id: string }) => f.id === "missing-geometry").geometry
    ).toBeNull();
    expect(read("utilities.geojson.gz").features[0].properties).toMatchObject({
      region_id: "region",
      geometry_source: "fixture",
    });
    expect(read("rates.json.gz")[0]).toMatchObject({
      utility_id: "utility",
      region_id: "region",
      attribution: { name: "Fixture attribution" },
    });
    expect(read("rates.json.gz")[0]).not.toHaveProperty("submitted_by");
    expect(read("programs.json.gz")[0].organizations[0].id).toBe("utility");
  });
});
