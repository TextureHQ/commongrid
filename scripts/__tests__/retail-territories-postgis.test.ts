import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

// Disposable local database only; never fall back to production DATABASE_URL.
const url = process.env.SNAPSHOT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("retail-exclusive tile derivation (PostGIS)", () => {
  it("carves nested and partial overlaps, quarantines equal shapes, and preserves sources", async () => {
    if (
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/boundary_test"
    ) {
      throw new Error("Use disposable local boundary_test only");
    }
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(`BEGIN;
        CREATE TEMP TABLE utilities (id text, slug text, name text, segment text, customer_count int,
          ba_code text, eia_id text, service_territory_id text, status text, deleted_at timestamptz);
        CREATE TEMP TABLE territories (id text, region_id text, geography geography, source text,
          source_url text, deleted_at timestamptz);
        CREATE TEMP TABLE regions (id text, state text, deleted_at timestamptz);
        INSERT INTO utilities (id, slug, name, segment, service_territory_id, status) VALUES
          ('iou','iou','IOU','INVESTOR_OWNED_UTILITY','iou','ACTIVE'),
          ('coop','coop','Co-op','DISTRIBUTION_COOPERATIVE','coop','ACTIVE'),
          ('muni','muni','Municipal','MUNICIPAL_UTILITY','muni','ACTIVE'),
          ('partial','partial','Partial','DISTRIBUTION_COOPERATIVE','partial','ACTIVE'),
          ('equal-a','equal-a','Equal A','MUNICIPAL_UTILITY','equal-a','ACTIVE'),
          ('equal-b','equal-b','Equal B','MUNICIPAL_UTILITY','equal-b','ACTIVE'),
          ('wapa','wapa','WAPA','INVESTOR_OWNED_UTILITY','wapa','ACTIVE'),
          ('gt','gt','Wholesale','GENERATION_AND_TRANSMISSION','gt','ACTIVE'),
          ('retired','retired','Retired','MUNICIPAL_UTILITY','retired','DEFUNCT');
        UPDATE utilities SET eia_id = '27000' WHERE id = 'wapa';
        INSERT INTO territories (id, region_id, geography, source, source_url) VALUES
          ('iou','iou',ST_MakeEnvelope(-110,30,-100,40,4326)::geography,'fixture','https://example.org'),
          ('coop','coop',ST_MakeEnvelope(-109,31,-105,35,4326)::geography,'fixture',NULL),
          ('muni','muni',ST_MakeEnvelope(-108,32,-107,33,4326)::geography,'fixture',NULL),
          ('partial','partial',ST_MakeEnvelope(-102,32,-98,36,4326)::geography,'fixture',NULL),
          ('equal-a','equal-a',ST_MakeEnvelope(-104,37,-103,38,4326)::geography,'fixture',NULL),
          ('equal-b','equal-b',ST_MakeEnvelope(-104,37,-103,38,4326)::geography,'fixture',NULL),
          ('wapa','wapa',ST_MakeEnvelope(-120,25,-95,45,4326)::geography,'fixture',NULL),
          ('gt','gt',ST_MakeEnvelope(-120,25,-95,45,4326)::geography,'fixture',NULL),
          ('retired','retired',ST_MakeEnvelope(-120,25,-95,45,4326)::geography,'fixture',NULL);
        INSERT INTO regions (id, state) SELECT region_id, 'CO' FROM territories;
      `);
      const before = (
        await client.query("SELECT id, ST_AsEWKB(geography::geometry) AS geom FROM territories ORDER BY id")
      ).rows;
      await client.query(readFileSync("scripts/derive-retail-territories.sql", "utf8"));
      const result = (
        await client.query("SELECT id, ST_IsValid(retail_geom) AS valid FROM retail_exclusive ORDER BY id")
      ).rows;
      expect(result.map((row) => row.id)).toEqual(["coop", "iou", "muni", "partial"]);
      expect(result.every((row) => row.valid)).toBe(true);
      const overlap =
        await client.query(`SELECT COALESCE(sum(ST_Area(ST_Intersection(a.retail_geom,b.retail_geom))),0) AS area
        FROM retail_exclusive a JOIN retail_exclusive b ON a.id < b.id AND a.retail_geom && b.retail_geom`);
      expect(Number(overlap.rows[0].area)).toBe(0);
      const owner = async (x: number, y: number) =>
        (
          await client.query(
            "SELECT id FROM retail_exclusive WHERE ST_Contains(retail_geom, ST_SetSRID(ST_Point($1,$2),4326))",
            [x, y]
          )
        ).rows.map((row) => row.id);
      expect(await owner(-107.5, 32.5)).toEqual(["muni"]);
      expect(await owner(-108.5, 31.5)).toEqual(["coop"]);
      expect(await owner(-101, 33)).toEqual(["partial"]);
      expect(await owner(-103.5, 37.5)).toEqual([]);
      const union = await client.query(`SELECT ST_Equals(
        (SELECT ST_UnaryUnion(ST_Collect(retail_geom)) FROM retail_exclusive),
        ST_Difference((SELECT ST_UnaryUnion(ST_Collect(geom)) FROM retail_candidates),
          (SELECT ST_UnaryUnion(ST_Collect(geom)) FROM retail_candidates WHERE ambiguous))) AS equal`);
      expect(union.rows[0].equal).toBe(true);
      const audit = (await client.query(readFileSync("scripts/audit-territory-overlap.sql", "utf8"))).rows[0];
      expect(audit.raw_overclaim_ratio).toBeGreaterThan(1);
      expect(audit.ambiguous_records).toHaveLength(2);
      expect(
        (await client.query("SELECT id, ST_AsEWKB(geography::geometry) AS geom FROM territories ORDER BY id")).rows
      ).toEqual(before);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
