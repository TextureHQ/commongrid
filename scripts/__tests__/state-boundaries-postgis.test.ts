import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Polygon } from "geojson";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPooledDb } from "@/lib/db/client-pooled";
import { VERMONT_UTILITY_EIA_IDS } from "../lib/vermont-utility-crosswalk";
import {
  buildRegionRecord,
  publishToDatabase,
  STATE_BOUNDARY_SOURCES,
  syncStateBoundaries,
} from "../sync-state-boundaries";

vi.mock("@/lib/db/client-pooled", () => ({ getPooledDb: vi.fn() }));

// Only ever runs against the disposable CI database, never DATABASE_URL.
const url = process.env.STATE_BOUNDARIES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const repair = readFileSync("drizzle/0037_reconcile_geometry_history_uniqueness.sql", "utf8");

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
    await pool.query(`
      ALTER TABLE entity_geometry_versions DROP CONSTRAINT IF EXISTS entity_geometry_versions_version_key;
      ALTER TABLE entity_geometry_versions DROP CONSTRAINT IF EXISTS test_deferred_key;
      DROP INDEX IF EXISTS test_equivalent_key;
      DROP INDEX IF EXISTS test_partial_key;
      DROP INDEX IF EXISTS test_nonunique_key;
    `);
    await pool.query(repair);
    await pool.query(
      "INSERT INTO utilities (eia_id, jurisdiction, service_territory_id) VALUES ('27316', 'VT', 'region-st-27316')"
    );
  });

  it("publishes only Vermont's 17 utilities and reruns idempotently without fetching other states", async () => {
    for (const eiaId of Object.values(VERMONT_UTILITY_EIA_IDS)) {
      if (eiaId === "27316") continue;
      await pool.query("INSERT INTO utilities (eia_id, jurisdiction, service_territory_id) VALUES ($1, 'VT', $2)", [
        eiaId,
        `region-st-${eiaId}`,
      ]);
    }
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).startsWith(config.url)) throw new Error("Unselected source fetched");
      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: Object.keys(VERMONT_UTILITY_EIA_IDS).map((COMPANYNAM) => ({
            type: "Feature",
            properties: { COMPANYNAM },
            geometry: polygon,
          })),
        })
      );
    });
    const options = { states: ["VT"], fetchImpl, writeManifest: false };
    const first = await syncStateBoundaries(options);
    expect(first.errors).toEqual([]);
    expect(first.fetchedSources).toBe(1);
    expect(first.territoriesUpserted).toBe(17);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (await pool.query("SELECT count(*) FROM territories WHERE source LIKE 'Vermont PSD%' AND version = 1")).rows[0]
        .count
    ).toBe("17");
    expect((await pool.query("SELECT count(*) FROM regions WHERE state = 'VT'")).rows[0].count).toBe("17");
    const publicationSnapshot = async () =>
      Promise.all(
        ["regions", "territories", "entity_versions", "entity_geometry_versions"].map(
          async (table) => (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows
        )
      );
    const before = await publicationSnapshot();
    const batches = (await pool.query("SELECT id FROM change_batches")).rows.map((row) => row.id);
    const second = await syncStateBoundaries(options);
    expect(second.territoriesUpserted).toBe(0);
    expect(second.fieldsWritten).toBe(0);
    expect(second.errors).toEqual([]);
    expect(second.regionsCreated).toBe(0);
    expect(second.regionsUpdated).toBe(0);
    expect(second.regionsUnchanged).toBe(17);
    expect(await publicationSnapshot()).toEqual(before);
    // applySync deliberately records every run, including no-ops. Empty audit
    // batches are expected; new entity or geometry versions are not.
    const newBatches = (await pool.query("SELECT id, version_count, completed_at FROM change_batches")).rows.filter(
      (row) => !batches.includes(row.id)
    );
    expect(newBatches).toHaveLength(2);
    for (const batch of newBatches) {
      expect(batch.version_count).toBe(0);
      expect(batch.completed_at).not.toBeNull();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reproduces 42P10 on historical geometry, then repairs and retries atomically", async () => {
    await pool.query("ALTER TABLE entity_geometry_versions DROP CONSTRAINT entity_geometry_versions_version_key");
    await pool.query(
      "INSERT INTO regions (id, slug, name, type, state, source) VALUES ('region-st-27316','stowe','Stowe','SERVICE_TERRITORY','VT','HIFLD')"
    );
    await pool.query(
      "INSERT INTO territories (id, region_id, geography, source) VALUES ('territory-27316','region-st-27316', ST_Multi(ST_GeomFromGeoJSON($1))::geography, 'HIFLD')",
      [JSON.stringify(polygon)]
    );
    await expect(publishToDatabase(entries(replacement))).rejects.toMatchObject({ cause: { code: "42P10" } });
    expect((await pool.query("SELECT source FROM regions")).rows[0].source).toBe("HIFLD");
    expect((await pool.query("SELECT version FROM territories")).rows[0].version).toBe(1);
    expect((await pool.query("SELECT count(*) FROM change_batches")).rows[0].count).toBe("0");
    await pool.query(repair);
    expect((await publishToDatabase(entries(replacement))).territoriesUpserted).toBe(1);
    expect((await publishToDatabase(entries(replacement))).territoriesUpserted).toBe(0);
    const history = await pool.query(
      "SELECT version_number, ST_AsGeoJSON(geography_snapshot)::json AS shape FROM entity_geometry_versions ORDER BY version_number"
    );
    expect(history.rows.map((row) => row.version_number)).toEqual([1, 2]);
    expect(history.rows[0].shape.coordinates).toEqual([polygon.coordinates]);
    expect(history.rows[1].shape.coordinates).toEqual([replacement.coordinates]);
  });

  it("reapplies without changing history or adding another index", async () => {
    await publishToDatabase(entries());
    const before = await pool.query("SELECT * FROM entity_geometry_versions ORDER BY id");
    const indexes = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'entity_geometry_versions' ORDER BY indexname"
    );
    await pool.query(repair);
    await pool.query(repair);
    expect((await pool.query("SELECT * FROM entity_geometry_versions ORDER BY id")).rows).toEqual(before.rows);
    expect(
      (
        await pool.query(
          "SELECT indexname FROM pg_indexes WHERE tablename = 'entity_geometry_versions' ORDER BY indexname"
        )
      ).rows
    ).toEqual(indexes.rows);
  });

  it("accepts a differently named and ordered unique index including extra payload", async () => {
    await pool.query("ALTER TABLE entity_geometry_versions DROP CONSTRAINT entity_geometry_versions_version_key");
    await pool.query(
      "CREATE UNIQUE INDEX test_equivalent_key ON entity_geometry_versions (version_number, entity_id, entity_type) INCLUDE (source_id)"
    );
    await pool.query(repair);
    expect(
      (await pool.query("SELECT 1 FROM pg_indexes WHERE indexname = 'entity_geometry_versions_version_key'")).rows
    ).toHaveLength(0);
    await publishToDatabase(entries());
    expect((await publishToDatabase(entries(replacement))).territoriesUpserted).toBe(1);
  });

  it("does not mistake partial or nonunique indexes for a usable key", async () => {
    await pool.query("ALTER TABLE entity_geometry_versions DROP CONSTRAINT entity_geometry_versions_version_key");
    await pool.query(
      "CREATE UNIQUE INDEX test_partial_key ON entity_geometry_versions (entity_type, entity_id, version_number) WHERE entity_type = 'territory'"
    );
    await pool.query(
      "CREATE INDEX test_nonunique_key ON entity_geometry_versions (entity_type, entity_id, version_number)"
    );
    await pool.query(repair);
    expect(
      (await pool.query("SELECT 1 FROM pg_indexes WHERE indexname = 'entity_geometry_versions_version_key'")).rows
    ).toHaveLength(1);
    await publishToDatabase(entries());
    expect((await publishToDatabase(entries(replacement))).territoriesUpserted).toBe(1);
  });

  it("refuses duplicate keys without deleting or renumbering any history", async () => {
    await pool.query("ALTER TABLE entity_geometry_versions DROP CONSTRAINT entity_geometry_versions_version_key");
    await pool.query(
      "INSERT INTO entity_geometry_versions (entity_type, entity_id, version_number) VALUES ('territory', 'duplicate', 1), ('territory', 'duplicate', 1)"
    );
    const before = await pool.query("SELECT * FROM entity_geometry_versions ORDER BY id");
    await expect(pool.query(repair)).rejects.toThrow(/Duplicate geometry history version keys/);
    expect((await pool.query("SELECT * FROM entity_geometry_versions ORDER BY id")).rows).toEqual(before.rows);
    expect(
      (await pool.query("SELECT 1 FROM pg_indexes WHERE indexname = 'entity_geometry_versions_version_key'")).rows
    ).toHaveLength(0);
  });

  it("fails clearly on a matching deferrable constraint rather than claiming repair", async () => {
    await pool.query("ALTER TABLE entity_geometry_versions DROP CONSTRAINT entity_geometry_versions_version_key");
    await pool.query(
      "ALTER TABLE entity_geometry_versions ADD CONSTRAINT test_deferred_key UNIQUE (entity_type, entity_id, version_number) DEFERRABLE"
    );
    await expect(pool.query(repair)).rejects.toThrow(/deferrable version key/);
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
