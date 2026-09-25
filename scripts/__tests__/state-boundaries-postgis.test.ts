import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Polygon } from "geojson";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPooledDb } from "@/lib/db/client-pooled";
import { buildRegionRecord, publishToDatabase, STATE_BOUNDARY_SOURCES } from "../sync-state-boundaries";

vi.mock("@/lib/db/client-pooled", () => ({ getPooledDb: vi.fn() }));

// Only ever runs against the disposable CI database, never DATABASE_URL.
const url = process.env.STATE_BOUNDARIES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("state boundary publication (real PostGIS)", () => {
  const pool = new Pool({ connectionString: url });
  const polygon: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-73, 44],
        [-72, 44],
        [-72, 45],
        [-73, 44],
      ],
    ],
  };
  const replacement: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-73, 44],
        [-72.5, 44],
        [-72, 45],
        [-73, 44],
      ],
    ],
  };
  const config = STATE_BOUNDARY_SOURCES.find((source) => source.state === "VT");
  if (!config) throw new Error("Vermont source missing");
  const record = buildRegionRecord(
    config,
    { type: "Feature", properties: { COMPANYNAM: "Village of Stowe Electric Dept." }, geometry: polygon },
    0
  );
  if (!record) throw new Error("Stowe mapping missing");
  const entries = (geometry = polygon) => [{ record, geometry }];

  beforeAll(async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/boundary_test"
    ) {
      throw new Error("Integration fixture requires localhost/boundary_test");
    }
    await pool.query(readFileSync("scripts/__tests__/fixtures/state-boundaries-postgis.sql", "utf8"));
    await pool.query(readFileSync("drizzle/0036_register_vermont_boundary_source.sql", "utf8"));
    // Exercise grants added by the migration, not a superuser publisher.
    const publisher = new Pool({ connectionString: url, options: "-c role=commongrid_sync" });
    vi.mocked(getPooledDb).mockReturnValue(drizzle(publisher) as unknown as ReturnType<typeof getPooledDb>);
    publisherPool = publisher;
  });
  let publisherPool: Pool | undefined;
  afterAll(async () => {
    await publisherPool?.end();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE entity_geometry_versions, entity_versions, change_batches, territories, regions, utilities RESTART IDENTITY CASCADE"
    );
    await pool.query(
      "INSERT INTO utilities (eia_id, jurisdiction, service_territory_id) VALUES ('27316', 'VT', 'region-st-27316')"
    );
  });

  it("creates, records geometry-only changes, preserves originals, and no-ops on repeat", async () => {
    expect((await publishToDatabase(entries())).territoriesUpserted).toBe(1);
    expect((await publishToDatabase(entries())).territoriesUpserted).toBe(0);
    expect((await publishToDatabase(entries(replacement))).territoriesUpserted).toBe(1);
    const history = await pool.query(
      "SELECT version_number, source_id, as_of, ST_AsGeoJSON(geography_snapshot)::json AS shape FROM entity_geometry_versions ORDER BY version_number"
    );
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0]).toMatchObject({
      version_number: 1,
      source_id: "vt-psd",
      as_of: null,
      shape: { type: "MultiPolygon", coordinates: [polygon.coordinates] },
    });
    expect(history.rows[1].shape.coordinates).toEqual([replacement.coordinates]);
    expect(
      (await pool.query("SELECT delta FROM entity_versions WHERE entity_type = 'territory' AND version_number = 2"))
        .rows[0].delta
    ).toHaveProperty("geography");
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(2);
  });

  it("captures pre-history geometry before replacement and retains unmatched HIFLD coverage", async () => {
    await pool.query(
      "INSERT INTO regions (id, slug, name, type, state, source) VALUES ('region-st-27316','stowe','Stowe','SERVICE_TERRITORY','VT','HIFLD'), ('unmatched','unmatched','Unmatched','SERVICE_TERRITORY','VT','HIFLD')"
    );
    await pool.query(
      "INSERT INTO territories (id, region_id, geography, source) VALUES ('territory-27316','region-st-27316', ST_Multi(ST_GeomFromGeoJSON($1))::geography, 'HIFLD')",
      [JSON.stringify(polygon)]
    );
    await publishToDatabase(entries(replacement));
    const previous = (
      await pool.query(
        "SELECT source_id, ST_AsGeoJSON(geography_snapshot)::json AS shape FROM entity_geometry_versions WHERE version_number = 1"
      )
    ).rows[0];
    expect(previous.source_id).toBeNull();
    expect(previous.shape.coordinates).toEqual([polygon.coordinates]);
    expect((await pool.query("SELECT deleted_at FROM regions WHERE id = 'unmatched'")).rows[0].deleted_at).toBeNull();
  });

  it("rolls back region metadata, batches, and geometry together for invalid polygons", async () => {
    await publishToDatabase(entries());
    const invalid: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [-73, 44],
          [-72, 45],
          [-73, 45],
          [-72, 44],
          [-73, 44],
        ],
      ],
    };
    const count = (await pool.query("SELECT count(*) FROM change_batches")).rows[0].count;
    await expect(
      publishToDatabase([{ record: { ...record, name: "Must not commit" }, geometry: invalid }])
    ).rejects.toThrow(/Invalid or empty/);
    expect((await pool.query("SELECT name FROM regions")).rows[0].name).toBe(record.name);
    expect((await pool.query("SELECT count(*) FROM change_batches")).rows[0].count).toBe(count);
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(1);
  });

  it("rolls back metadata when a human owns geometry", async () => {
    await publishToDatabase(entries());
    await pool.query("UPDATE entity_versions SET source_type = 'community' WHERE entity_type = 'territory'");
    await expect(
      publishToDatabase([{ record: { ...record, name: "Must not commit" }, geometry: replacement }])
    ).rejects.toThrow(/rolled back for review/);
    expect((await pool.query("SELECT name FROM regions")).rows[0].name).toBe(record.name);
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(1);
  });

  it("preserves existing customer counts when the boundary source has none", async () => {
    await publishToDatabase(entries());
    await pool.query("UPDATE regions SET customers = 4321");
    await publishToDatabase(entries(replacement));
    expect((await pool.query("SELECT customers FROM regions")).rows[0].customers).toBe(4321);
  });

  it("uses the latest spatial author, not an older human contribution", async () => {
    await publishToDatabase(entries());
    await publishToDatabase(entries(replacement));
    await pool.query("UPDATE entity_geometry_versions SET contribution_id = 'old-human-edit' WHERE version_number = 1");
    expect((await publishToDatabase(entries())).territoriesUpserted).toBe(1);
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(3);
  });

  it("protects the latest human spatial version without attribute markers", async () => {
    await publishToDatabase(entries());
    await pool.query("UPDATE entity_geometry_versions SET contribution_id = 'current-human-edit'");
    await expect(publishToDatabase(entries(replacement))).rejects.toThrow(/rolled back for review/);
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(1);
  });

  it("rejects missing canonical utility links before any writes", async () => {
    await pool.query("UPDATE utilities SET service_territory_id = NULL");
    await expect(publishToDatabase(entries())).rejects.toThrow(/missing utility records/);
    expect((await pool.query("SELECT count(*) FROM regions")).rows[0].count).toBe("0");
  });
});
