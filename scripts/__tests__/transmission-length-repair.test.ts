import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.SNAPSHOT_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("transmission ground miles migration (PostGIS)", () => {
  it("measures multipart ground distance at different latitudes and preserves unknowns", () => {
    if (
      !databaseUrl ||
      !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
      !["/boundary_test", "/snapshot_test"].includes(new URL(databaseUrl).pathname)
    ) {
      throw new Error("Use a disposable local test database");
    }
    const migration = readFileSync(resolve("drizzle/0041_repair_transmission_ground_miles.sql"), "utf8");
    const repair = readFileSync(resolve("scripts/repair-transmission-lengths.sql"), "utf8").replace(
      /^(BEGIN;|COMMIT;)$/gm,
      ""
    );
    const result = execFileSync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
      input: `BEGIN;
        CREATE SCHEMA length_test;
        SET search_path TO length_test, public;
        CREATE TABLE transmission_lines (id text PRIMARY KEY, length_miles double precision NOT NULL,
          geometry geometry(MultiLineString,4326), version integer DEFAULT 1, updated_at timestamptz);
        INSERT INTO transmission_lines(id,length_miles,geometry) VALUES
          ('equator', 999999, ST_GeomFromText('MULTILINESTRING((0 0,1 0))',4326)),
          ('north', 999999, ST_GeomFromText('MULTILINESTRING((0 60,1 60))',4326)),
          ('multi', 999999, ST_GeomFromText('MULTILINESTRING((0 0,1 0),(1 0,2 0))',4326)),
          ('missing', 999999, NULL),
          ('empty', 999999, ST_GeomFromText('MULTILINESTRING EMPTY',4326));
        ${migration}
        ${repair}
        SELECT json_object_agg(id,length_miles) FROM transmission_lines;
        SELECT count(*) FROM transmission_length_repair_0041 WHERE length_miles = 999999;
        DROP TABLE repair_lengths;
        UPDATE transmission_lines SET length_miles=42,version=version+1 WHERE id='equator';
        ${repair}
        SELECT length_miles FROM transmission_lines WHERE id='equator';
        ROLLBACK;`,
      encoding: "utf8",
    });
    const values = JSON.parse(result.split("\n").find((line) => line.startsWith("{"))!);
    expect(values.equator).toBeCloseTo(69.093, 2);
    expect(values.north).toBeCloseTo(34.546, 2);
    expect(values.multi).toBeCloseTo(values.equator * 2, 5);
    expect(values.missing).toBeNull();
    expect(values.empty).toBeNull();
    expect(result.split("\n")).toContain("5");
    expect(result.split("\n")).toContain("42");
  });
});
